import fs from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { getDatabase } from './db.js';

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

getDatabase(config.dbPath);

const app = createApp();

app.listen(config.port, () => {
  console.log(`[AI SLICE] Server listening at http://localhost:${config.port}`);
  console.log(`[AI SLICE] Environment: ${config.nodeEnv}`);
});
