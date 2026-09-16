import fs from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { getDatabase, closeDatabase } from './db.js';

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

getDatabase(config.dbPath);

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[AI SLICE] Server listening at http://localhost:${config.port}`);
  console.log(`[AI SLICE] Environment: ${config.nodeEnv}`);
});

// Process-level safety nets (do not crash silently)
process.on('unhandledRejection', (reason) => {
  console.error('[AI SLICE] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[AI SLICE] Uncaught exception:', err);
});

// Graceful shutdown: close DB and let active workers drain
function shutdown(signal) {
  console.log(`[AI SLICE] Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
