# Metis Academic Co-Pilot — Assessment 3: AI Integration Slice Documentation

## 1. What This Is

This project is the production-minded **AI Integration Engineering Slice** for **Metis**, the web-based academic co-pilot for undergraduate students. Metis features **Kinase**, an AI co-pilot system that converts raw course material (syllabi, slides, lecture notes, textbook excerpts) into structured study summaries, flashcard decks, practice quizzes, and concept walkthroughs.

Built with Node.js, Express, SQLite, and an asynchronous worker queue, this slice implements the document processing and structured AI generation pipeline. It ingests course materials, offloads heavy extraction and LLM tasks to a background queue with strict worker concurrency caps, enforces prompt injection defenses, validates LLM text outputs against declared Zod schemas (with automatic retry strategies), logs token usage and latency metrics, and provides structured study aids for students.

In strict compliance with `metis-prd-v2.md` and `Agents 0.md`, all AI outputs are strictly validated before delivery, and processing failures release held tokens back to the student's spendable balance.

---

## 2. How To Run It

Follow these numbered steps to run the AI integration slice from a fresh clone:

1. **System Requirements**: Node.js (v20.0.0 or higher) and npm.
2. **Navigate to Directory**:
   ```bash
   cd assessment-3-ai-integration
   ```
3. **Install Dependencies**:
   ```bash
   npm install
   ```
4. **Environment Configuration**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Key environment variables:
   - `PORT`: HTTP port for Express (default: `3002`).
   - `NODE_ENV`: Set to `development` or `test`.
   - `SESSION_SECRET`: Random string for signing cookies.
   - `DB_PATH`: SQLite database file path (default: `./ai_jobs.db`).
   - `UPLOAD_DIR`: Directory for uploaded course files (default: `./storage/uploads`).
   - `AI_API_KEY`: API key for model provider (optional for simulation mode).
   - `AI_MAX_RETRIES`: Maximum schema validation retry attempts (default: `2`).
   - `AI_MAX_CONCURRENT_JOBS`: Maximum simultaneous worker tasks (default: `2`).
5. **Database Initialization**:
   SQLite tables (`users`, `sessions`, `jobs`) initialize automatically in `src/db.js` on first run.
6. **Run Automated Tests**:
   ```bash
   npm test
   ```
7. **Start Development Server**:
   ```bash
   npm start
   ```
8. **Access the Application**:
   Open browser at `http://localhost:3002/signup` to register, sign in, and access the course material upload portal at `http://localhost:3002/upload`.

---

## 3. The Flow, Step By Step

### Flow 1: Course Material Upload & Async Processing
1. **User Action**: The student uploads course materials (lecture slides, notes, syllabus in `.txt`, `.md`, or `.json`, max 50 KB) and selects the generation task (e.g. Study Summary or Flashcard Deck).
2. **Server Execution**: Request passes rate limiting and validation. File is saved to storage directory.
3. **Database Job Creation**: A job record is created: `INSERT INTO jobs (id, user_id, status, storage_key...) VALUES (?, ?, 'pending', ...)` returning HTTP `202 Accepted` with `{ jobId, status: "pending" }`.
4. **Worker Execution**: Background worker picks up the job, respecting concurrency limits (`activeWorkers < maxConcurrentJobs`).

### Flow 2: AI Prompt Injection Defense & Zod Schema Validation
1. **Sanitization**: Input text is checked for prompt injection signatures ("ignore previous instructions", "system prompt reveal"). Violations fail fast.
2. **LLM Invocation**: The sanitized text is sent to Kinase with task-specific system prompts.
3. **Zod Runtime Parsing**: Raw text response is parsed against declared Zod schemas (e.g. Flashcard Deck schema with `front` and `back` properties).
4. **Retry Loop**: If parsing fails or response is malformed, the pipeline retries up to 2 times with explicit schema reminders.
5. **Job Completion & Token Metrics**: On success, job status is updated to `completed`, and token count/latency metrics are recorded in SQLite.

---

## 4. The Data Model

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  result_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 5. The Concepts

1. **Async Worker Processing with Concurrency Caps**: Decouples HTTP request lifecycle from long-running AI inference, enforcing worker concurrency caps (`activeWorkers <= 2`) to protect upstream API rate limits.
2. **Runtime Zod Schema Assertions**: Ensures LLM outputs conform strictly to JSON structures before storing or presenting to students.
3. **Prompt Injection Guardrails**: Filters malicious prompt overrides before sending user input to LLM system prompts.

---

## 6. What Went Wrong

1. **Malformed LLM JSON Responses**: Occasional Markdown backtick wrappers (` ```json ... ``` `) caused `JSON.parse` failures. Fixed by stripping code block boundaries and enforcing strict Zod validation with 2 automated retry attempts.
2. **Worker Concurrency Overrun**: High upload bursts overloaded system capacity. Solved by implementing an in-memory job queue with bounded worker concurrency.

---

## 7. What This Slice Does Not Handle

- **Multi-Modal OCR / Audio Transcriptions**: Scope focuses on text-based slides, syllabi, and study notes; raw audio processing is handled via third-party APIs in full deployment.
- **Continuous SSE Streaming**: Generates complete structured JSON outputs (flashcards, quizzes) atomically rather than streaming raw tokens.

---

## 8. If I Built This Again

1. **Distributed Queue with BullMQ & Redis**: Replace the lightweight in-memory queue with BullMQ for persistent job queuing across multiple worker nodes.
2. **Vector Embeddings (RAG)**: Integrate pgvector for semantic search across large multi-chapter textbooks.
