import fs from 'node:fs';
import { getDatabase } from '../db.js';
import { config } from '../config.js';
import { invokeAiModel } from './provider.js';
import { role1Prompt, role2Prompt } from './prompts.js';
import { jobExtractionSchema, interviewRubricSchema } from './schemas.js';

class JobQueue {
  constructor() {
    this.queue = [];
    this.activeWorkers = 0;
    this.peakConcurrency = 0;
  }

  enqueue(jobId) {
    this.queue.push(jobId);
    this.processNext();
  }

  async processNext() {
    if (this.activeWorkers >= config.ai.maxConcurrentJobs || this.queue.length === 0) {
      return;
    }

    const jobId = this.queue.shift();
    this.activeWorkers += 1;
    if (this.activeWorkers > this.peakConcurrency) {
      this.peakConcurrency = this.activeWorkers;
    }

    try {
      await this.runJob(jobId);
    } catch (err) {
      console.error(`Error in worker processing job ${jobId}:`, err);
    } finally {
      this.activeWorkers -= 1;
      this.processNext();
    }
  }

  async runJob(jobId) {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) return;

    db.prepare('UPDATE jobs SET status = \'processing\', updated_at = ? WHERE id = ?').run(now, jobId);

    let fileContent = '';
    try {
      fileContent = fs.readFileSync(job.storage_key, 'utf-8');
    } catch (err) {
      db.prepare('UPDATE jobs SET status = \'failed\', error_message = ?, updated_at = ? WHERE id = ?')
        .run(`Could not read file from storage: ${err.message}`, Math.floor(Date.now() / 1000), jobId);
      return;
    }

    let success = false;
    let attempts = 0;
    const maxAttempts = config.ai.maxRetries + 1;
    let lastError = '';
    let lastRawOutput = '';

    while (attempts < maxAttempts && !success) {
      attempts += 1;
      const attemptTimestamp = Math.floor(Date.now() / 1000);
      db.prepare('UPDATE jobs SET attempts = ?, updated_at = ? WHERE id = ?').run(attempts, attemptTimestamp, jobId);

      try {
        const rawOutput = await invokeAiModel({
          promptRole: role1Prompt,
          userContent: fileContent,
          timeoutMs: config.ai.timeoutMs,
        });

        lastRawOutput = rawOutput;

        // Parse JSON
        let parsedJson;
        try {
          parsedJson = JSON.parse(rawOutput);
        } catch (jsonErr) {
          throw new Error(`Model returned invalid JSON syntax: ${jsonErr.message}`);
        }

        // Schema validation
        const validation = jobExtractionSchema.safeParse(parsedJson);
        if (!validation.success) {
          const formattedIssues = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
          throw new Error(`Model output failed schema validation: ${formattedIssues}`);
        }

        // Succeeded & validated
        const doneTimestamp = Math.floor(Date.now() / 1000);
        db.prepare(`
          UPDATE jobs
          SET status = 'done',
              result_json = ?,
              raw_output = ?,
              error_message = NULL,
              updated_at = ?
          WHERE id = ?
        `).run(JSON.stringify(validation.data), rawOutput, doneTimestamp, jobId);

        success = true;
      } catch (err) {
        lastError = err.message;
        console.warn(`[WORKER] Job ${jobId} attempt ${attempts}/${maxAttempts} failed: ${err.message}`);
      }
    }

    if (!success) {
      const failTimestamp = Math.floor(Date.now() / 1000);
      db.prepare(`
        UPDATE jobs
        SET status = 'failed',
            raw_output = ?,
            error_message = ?,
            updated_at = ?
        WHERE id = ?
      `).run(lastRawOutput || null, lastError, failTimestamp, jobId);
    }
  }

  reset() {
    this.queue = [];
    this.activeWorkers = 0;
    this.peakConcurrency = 0;
  }
}

export const jobQueue = new JobQueue();

/**
 * Executes Role 2 follow-up action (Generate Interview Rubric) on a completed job.
 */
export async function executeFollowUpAction(jobId, db = getDatabase()) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'done') throw new Error('Cannot execute follow-up action on incomplete job');

  const rawOutput = await invokeAiModel({
    promptRole: role2Prompt,
    userContent: job.result_json,
    timeoutMs: config.ai.timeoutMs,
  });

  let parsedJson;
  try {
    parsedJson = JSON.parse(rawOutput);
  } catch (e) {
    throw new Error(`Follow-up model returned invalid JSON syntax: ${e.message}`);
  }

  const validation = interviewRubricSchema.safeParse(parsedJson);
  if (!validation.success) {
    throw new Error('Follow-up rubric output failed schema validation');
  }

  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE jobs
    SET follow_up_action = 'interview_rubric',
        follow_up_result = ?,
        updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(validation.data), now, jobId);

  return validation.data;
}
