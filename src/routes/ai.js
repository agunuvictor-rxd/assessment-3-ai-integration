import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { getDatabase } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter, followUpLimiter } from '../middleware/rate-limiter.js';
import { jobQueue, executeFollowUpAction } from '../ai/worker.js';

export const aiRouter = Router();

// Configure multer for disk storage (only storage keys stored in database)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueKey = `${Date.now()}_${crypto.randomUUID()}${ext}`;
    cb(null, uniqueKey);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeBytes, // 50 KB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.allowedExtensions.includes(ext)) {
      return cb(new Error(`Unsupported file type: ${ext}. Only .txt, .md, and .json files are allowed.`));
    }
    cb(null, true);
  },
});

/**
 * 1. Upload Job Description & Enqueue Background AI Task
 * Returns HTTP 202 Accepted immediately without blocking on model execution.
 */
aiRouter.post('/upload', requireAuth, uploadLimiter, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: `File size exceeds the 50 KB limit (${config.maxFileSizeBytes} bytes).`,
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Please select a file.' });
    }

    if (req.file.size === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded file is empty.' });
    }

    const db = getDatabase();
    const jobId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO jobs (
        id, user_id, status, attempts, storage_key, original_filename, file_size_bytes,
        error_message, raw_output, result_json, created_at, updated_at
      ) VALUES (?, ?, 'pending', 0, ?, ?, ?, NULL, NULL, NULL, ?, ?)
    `).run(
      jobId,
      req.user.id,
      req.file.path,
      req.file.originalname,
      req.file.size,
      now,
      now
    );

    // Enqueue to background worker with concurrency control
    jobQueue.enqueue(jobId);

    return res.status(202).json({
      success: true,
      jobId,
      status: 'pending',
      message: 'File accepted. Background processing has begun.',
      redirectUrl: `/jobs/${jobId}`,
    });
  });
});

/**
 * 2. Get Job Status & Result
 */
aiRouter.get('/jobs/:id', requireAuth, (req, res) => {
  const db = getDatabase();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found.' });
  }

  return res.status(200).json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      originalFilename: job.original_filename,
      fileSizeBytes: job.file_size_bytes,
      storageKey: job.storage_key,
      errorMessage: job.error_message,
      rawOutput: job.raw_output,
      resultJson: safeJsonParse(job.result_json),
      followUpAction: job.follow_up_action,
      followUpResult: safeJsonParse(job.follow_up_result),
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    },
  });
});

/**
 * 3. Follow-up AI Action: Generate Technical Interview Rubric
 */
aiRouter.post('/jobs/:id/follow-up', requireAuth, followUpLimiter, async (req, res) => {
  try {
    const db = getDatabase();
    const job = db.prepare('SELECT id, user_id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found.' });
    }

    const rubric = await executeFollowUpAction(job.id);
    return res.status(200).json({
      success: true,
      rubric,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}
