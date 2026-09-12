import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-session-ai-slice-key-32chars',
  get dbPath() {
    return process.env.DB_PATH || './ai_jobs.db';
  },
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './storage/uploads'),

  // AI Configuration
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    modelName: process.env.AI_MODEL_NAME || 'gpt-4o-mini',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '10000', 10),
    maxRetries: parseInt(process.env.AI_MAX_RETRIES || '2', 10),
    maxConcurrentJobs: parseInt(process.env.AI_MAX_CONCURRENT_JOBS || '2', 10),

    // Role 1: Requirements Extraction (deterministic)
    role1: {
      name: 'Requirements Extractor',
      temperature: parseFloat(process.env.AI_ROLE1_TEMPERATURE || '0.2'),
      maxTokens: parseInt(process.env.AI_ROLE1_MAX_TOKENS || '1024', 10),
    },

    // Role 2: Interview Rubric Generator (synthesis)
    role2: {
      name: 'Technical Interview Evaluator',
      temperature: parseFloat(process.env.AI_ROLE2_TEMPERATURE || '0.5'),
      maxTokens: parseInt(process.env.AI_ROLE2_MAX_TOKENS || '1024', 10),
    },
  },

  // Upload limits
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || '51200', 10), // 50 KB
  allowedMimeTypes: ['text/plain', 'text/markdown', 'application/json'],
  allowedExtensions: ['.txt', '.md', '.json'],
};
