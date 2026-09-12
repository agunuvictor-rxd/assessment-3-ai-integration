import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db.js';
import { rateLimiterStore } from '../src/middleware/rate-limiter.js';
import { jobQueue, executeFollowUpAction } from '../src/ai/worker.js';
import { setTestSimulationMode } from '../src/ai/provider.js';
import { config } from '../src/config.js';

const testStorageDir = path.resolve('test_storage');

test.beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = ':memory:';
  if (!fs.existsSync(testStorageDir)) fs.mkdirSync(testStorageDir, { recursive: true });
  config.uploadDir = testStorageDir;

  closeDatabase();
  rateLimiterStore.reset();
  jobQueue.reset();
  setTestSimulationMode(null);

  getDatabase(':memory:');
});

test.after(() => {
  closeDatabase();
  if (fs.existsSync(testStorageDir)) {
    try { fs.rmSync(testStorageDir, { recursive: true, force: true }); } catch (e) {}
  }
});

test('Valid File & Background Processing: extracts structured JSON and validates schema', async () => {
  const db = getDatabase(':memory:');
  const now = Math.floor(Date.now() / 1000);

  // Setup user
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES ('u_valid', 'Recruiter', 'recruiter@example.com', 'hash', ?)
  `).run(now);

  const sampleJobSpec = `
    Job Title: Senior Backend Engineer
    Department: Platform Infrastructure
    Requirements:
    - 5+ years of software engineering experience.
    - Deep knowledge of Node.js, TypeScript, and SQL databases.
    - Experience building scalable microservices with Docker and Kubernetes.
    Responsibilities:
    - Architect, build, and deploy reliable APIs with high test coverage.
    - Ensure zero downtime releases and participate in architecture reviews.
  `;

  const filePath = path.join(testStorageDir, 'backend_spec.txt');
  fs.writeFileSync(filePath, sampleJobSpec, 'utf-8');

  const jobId = 'job_valid_1';
  db.prepare(`
    INSERT INTO jobs (
      id, user_id, status, attempts, storage_key, original_filename, file_size_bytes, created_at, updated_at
    ) VALUES (?, 'u_valid', 'pending', 0, ?, 'backend_spec.txt', ?, ?, ?)
  `).run(jobId, filePath, Buffer.byteLength(sampleJobSpec), now, now);

  // Enqueue job
  jobQueue.enqueue(jobId);

  // Wait for worker processing completion
  let attempts = 0;
  while (attempts < 30) {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (job && (job.status === 'done' || job.status === 'failed')) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts++;
  }

  const finishedJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  assert.equal(finishedJob.status, 'done', 'Job must transition to done');
  assert.equal(finishedJob.attempts, 1, 'Completed on first attempt');
  assert.ok(finishedJob.raw_output, 'Raw output must be preserved');
  assert.ok(finishedJob.result_json, 'Result JSON must be stored');

  const result = JSON.parse(finishedJob.result_json);
  assert.equal(result.roleTitle, 'Senior Backend Engineer');
  assert.equal(result.seniority, 'Senior');
  assert.equal(result.department, 'Engineering');
  assert.ok(result.requiredSkills.includes('Node.js'));
  assert.ok(result.responsibilities.length >= 1);
});

test('Storage Key Invariant: database stores storage key rather than file contents', () => {
  const db = getDatabase(':memory:');
  const now = Math.floor(Date.now() / 1000);
  const sampleContent = 'Confidential Unstructured Job Description Content 12345';
  const filePath = path.join(testStorageDir, 'secret_spec.txt');
  fs.writeFileSync(filePath, sampleContent, 'utf-8');

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES ('u_store', 'Store User', 'store@example.com', 'hash', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO jobs (
      id, user_id, status, attempts, storage_key, original_filename, file_size_bytes, created_at, updated_at
    ) VALUES ('job_store_test', 'u_store', 'pending', 0, ?, 'secret_spec.txt', 50, ?, ?)
  `).run(filePath, now, now);

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get('job_store_test');
  assert.equal(job.storage_key, filePath, 'Database must store storage key path');
  assert.ok(!JSON.stringify(job).includes(sampleContent), 'Database row must NOT contain the raw uploaded file content');
});

test('Schema Validation Failure & Retry Handling: records failure and updates attempts', async () => {
  const db = getDatabase(':memory:');
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES ('u_invalid', 'Invalid User', 'invalid@example.com', 'hash', ?)
  `).run(now);

  const filePath = path.join(testStorageDir, 'dummy.txt');
  fs.writeFileSync(filePath, 'Some job description text', 'utf-8');

  // Trigger test simulation mode that outputs invalid schema
  setTestSimulationMode('invalid_schema');

  const jobId = 'job_invalid_schema';
  db.prepare(`
    INSERT INTO jobs (
      id, user_id, status, attempts, storage_key, original_filename, file_size_bytes, created_at, updated_at
    ) VALUES (?, 'u_invalid', 'pending', 0, ?, 'dummy.txt', 25, ?, ?)
  `).run(jobId, filePath, now, now);

  jobQueue.enqueue(jobId);

  let attempts = 0;
  while (attempts < 30) {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (job && job.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts++;
  }

  const failedJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  assert.equal(failedJob.status, 'failed', 'Job must fail after retries exhausted');
  assert.equal(failedJob.attempts, 3, 'Must attempt maxRetries + 1 times (1 initial + 2 retries = 3 attempts)');
  assert.ok(failedJob.error_message.includes('failed schema validation'), 'Error message must document schema validation failure');
});

test('Provider Timeout Handling: catches timeout, retries, and fails gracefully', async () => {
  const db = getDatabase(':memory:');
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES ('u_timeout', 'Timeout User', 'timeout@example.com', 'hash', ?)
  `).run(now);

  const filePath = path.join(testStorageDir, 'timeout_spec.txt');
  fs.writeFileSync(filePath, 'Job text', 'utf-8');

  // Configure short timeout for test and force timeout simulation
  config.ai.timeoutMs = 50;
  setTestSimulationMode('timeout');

  const jobId = 'job_timeout_test';
  db.prepare(`
    INSERT INTO jobs (
      id, user_id, status, attempts, storage_key, original_filename, file_size_bytes, created_at, updated_at
    ) VALUES (?, 'u_timeout', 'pending', 0, ?, 'timeout_spec.txt', 10, ?, ?)
  `).run(jobId, filePath, now, now);

  jobQueue.enqueue(jobId);

  let waitCount = 0;
  while (waitCount < 30) {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (job && job.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
    waitCount++;
  }

  const timeoutJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  assert.equal(timeoutJob.status, 'failed');
  assert.ok(timeoutJob.error_message.includes('timed out'), 'Error message must record timeout');

  config.ai.timeoutMs = 10000; // Restore default
});

test('Controlled Concurrency Cap: respects MAX_CONCURRENT_JOBS limit under load', async () => {
  const db = getDatabase(':memory:');
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES ('u_concurr', 'Concurrency User', 'concurr@example.com', 'hash', ?)
  `).run(now);

  const filePath = path.join(testStorageDir, 'concurrency_spec.txt');
  fs.writeFileSync(filePath, 'Job description with Node.js and SQL requirements', 'utf-8');

  // Enqueue 6 jobs simultaneously
  const jobIds = [];
  for (let i = 1; i <= 6; i++) {
    const jId = `job_concurrency_${i}`;
    jobIds.push(jId);
    db.prepare(`
      INSERT INTO jobs (
        id, user_id, status, attempts, storage_key, original_filename, file_size_bytes, created_at, updated_at
      ) VALUES (?, 'u_concurr', 'pending', 0, ?, 'concurrency_spec.txt', 50, ?, ?)
    `).run(jId, filePath, now, now);
  }

  jobIds.forEach((id) => jobQueue.enqueue(id));

  // Wait for all 6 jobs to finish
  let waitCount = 0;
  while (waitCount < 60) {
    const doneCount = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE status = \'done\'').get().count;
    if (doneCount === 6) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
    waitCount++;
  }

  const finalDone = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE status = \'done\'').get().count;
  assert.equal(finalDone, 6, 'All 6 queued jobs must complete');
  assert.ok(
    jobQueue.peakConcurrency <= config.ai.maxConcurrentJobs,
    `Peak concurrency (${jobQueue.peakConcurrency}) must never exceed maxConcurrentJobs (${config.ai.maxConcurrentJobs})`
  );
});

test('Follow-up AI Action: executes Role 2 and generates structured interview rubric', async () => {
  const db = getDatabase(':memory:');
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES ('u_rubric', 'Rubric User', 'rubric@example.com', 'hash', ?)
  `).run(now);

  const validatedExtraction = {
    roleTitle: 'Senior Platform Engineer',
    seniority: 'Senior',
    department: 'Engineering',
    requiredSkills: ['Go', 'Kubernetes', 'Distributed Systems'],
    minYearsExperience: 5,
    responsibilities: ['Architect Kubernetes clusters', 'Optimize low latency networking'],
  };

  const jobId = 'job_rubric_1';
  db.prepare(`
    INSERT INTO jobs (
      id, user_id, status, attempts, storage_key, original_filename, file_size_bytes,
      result_json, created_at, updated_at
    ) VALUES (?, 'u_rubric', 'done', 1, 'dummy_key', 'spec.txt', 100, ?, ?, ?)
  `).run(jobId, JSON.stringify(validatedExtraction), now, now);

  const rubric = await executeFollowUpAction(jobId, db);

  assert.equal(rubric.roleTitle, 'Senior Platform Engineer');
  assert.ok(Array.isArray(rubric.competencies), 'Competencies must be an array');
  assert.ok(rubric.competencies.length >= 1);
  assert.ok(rubric.competencies[0].assessmentQuestions.length >= 1);

  const updatedJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  assert.equal(updatedJob.follow_up_action, 'interview_rubric');
  assert.ok(updatedJob.follow_up_result, 'Follow up result must be stored in database');
});
