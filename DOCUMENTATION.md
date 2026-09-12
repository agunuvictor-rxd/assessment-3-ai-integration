# 1. What This Is

This project is a complete, production-minded AI integration engineering slice built in Node.js with Express, SQLite, and an asynchronous worker queue. It implements a document intelligence workflow that ingests unstructured job descriptions, offloads work to a background queue, enforces a strict worker concurrency cap, invokes an AI model using designated system prompts, rigorously asserts the output against declared Zod schemas in application code, and allows the user to execute a follow-up AI action that synthesizes a technical interview evaluation rubric.

In strict compliance with the assessment brief, this application deliberately excludes multi-page resume parsing, applicant tracking system (ATS) candidate matching, vector embeddings, semantic RAG search, multi-tenant collaboration, and complex dashboard metrics. These features were omitted because adding broad product capabilities distracts from evaluating core AI engineering competencies: background processing, concurrency controls, schema validation resilience, timeout fallbacks, and storage boundaries.

---

# 2. How To Run It

Follow these numbered steps to run the AI integration slice from a fresh clone:

1. **System Requirements**: Node.js (v20.0.0 or higher, tested on v24.16.0) and npm.
2. **Navigate to Repository**:
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
   Environment variables:
   - `PORT`: HTTP server port (default: `3002`).
   - `NODE_ENV`: Set to `development` or `test`.
   - `SESSION_SECRET`: Minimum 32-character string for cookie encryption.
   - `DB_PATH`: SQLite database file path (default: `./ai_jobs.db`).
   - `UPLOAD_DIR`: Filesystem directory for uploaded files (default: `./storage/uploads`).
   - `AI_API_KEY`: API key for model provider (optional for local/test simulation mode).
   - `AI_MODEL_NAME`: Target model (default: `gpt-4o-mini`).
   - `AI_ROLE1_TEMPERATURE`: Temperature for extraction role (default: `0.2`).
   - `AI_ROLE1_MAX_TOKENS`: Token ceiling for extraction role (default: `1024`).
   - `AI_ROLE2_TEMPERATURE`: Temperature for rubric evaluation role (default: `0.5`).
   - `AI_ROLE2_MAX_TOKENS`: Token ceiling for rubric evaluation role (default: `1024`).
   - `AI_TIMEOUT_MS`: Model invocation timeout in milliseconds (default: `10000`).
   - `AI_MAX_RETRIES`: Maximum schema validation retry attempts (default: `2`).
   - `AI_MAX_CONCURRENT_JOBS`: Maximum simultaneous worker tasks (default: `2`).
   - `MAX_FILE_SIZE_BYTES`: Upload file size limit in bytes (default: `51200` = 50 KB).
5. **Database Initialization**:
   SQLite tables (`users`, `sessions`, `jobs`) are automatically initialized in [src/db.js](file:///src/db.js) on first run.
6. **Run Automated Tests**:
   ```bash
   npm test
   ```
7. **Start Development Server**:
   ```bash
   npm start
   ```
8. **Access the Application**:
   Open `http://localhost:3002/signup` to register a test user, sign in, and access the document upload portal at `http://localhost:3002/upload`.

---

# 3. The Flow, Step By Step

### Flow 1: Job Description Upload & Immediate Asynchronous Hand-off
1. **User Action**: The user selects a job description file (`.txt`, `.md`, or `.json`, max 50 KB) and clicks "Start Asynchronous Analysis".
2. **Frontend Payload**: Form posts multipart/form-data to `POST /api/ai/upload`.
3. **Server Execution**: The request passes through `uploadLimiter` ([src/middleware/rate-limiter.js](file:///src/middleware/rate-limiter.js)). Multer validates file extension and size. In [src/routes/ai.js](file:///src/routes/ai.js), the file is saved to disk at `storage/uploads/<timestamp>_<uuid>.<ext>`.
4. **Database Job Record**: A job is created: `INSERT INTO jobs (id, user_id, status, attempts, storage_key, original_filename, file_size_bytes, created_at, updated_at) VALUES (?, ?, 'pending', 0, ?, ?, ?, now, now)`. Only the disk storage key is saved in SQLite; the file content is never loaded into the database.
5. **Immediate Response**: The server returns HTTP `202 Accepted` with `{ success: true, jobId, status: "pending", redirectUrl: "/jobs/<id>" }`. The client is redirected immediately without waiting for AI model inference.

### Flow 2: Background Worker Execution & Concurrency Cap
1. **Queue Dispatch**: `jobQueue.enqueue(jobId)` places the job into the in-memory queue.
2. **Concurrency Control**: `jobQueue.processNext()` checks if `activeWorkers < config.ai.maxConcurrentJobs` (capped at 2). If 50 jobs were queued, exactly 2 run simultaneously while 48 wait safely in line.
3. **Worker Processing**: When a slot opens, `activeWorkers` increments. The worker transitions the job in SQLite: `UPDATE jobs SET status = 'processing', updated_at = now`.
4. **Model Invocation with Role 1**: Reads file content from disk using `storage_key`. Calls `invokeAiModel` with Role 1 system prompt ("Principal Technical Recruiter"), temperature `0.2`, and a 10-second `AbortController` timeout ([src/ai/provider.js](file:///src/ai/provider.js)).
5. **Application-Side Schema Validation**: The worker receives raw JSON from the model and asserts it against `jobExtractionSchema` using Zod ([src/ai/schemas.js](file:///src/ai/schemas.js)).
   - If validation passes: updates SQLite to `status = 'done'`, stores `result_json` and `raw_output`.
   - If validation fails or model returns invalid syntax: catches error, increments `attempts`, and retries up to `maxRetries = 2`. If still invalid after 3 total attempts, transitions to `status = 'failed'`, records the exact schema error in `error_message`, and logs failure honestly.
6. **Worker Freeing**: In `finally`, `activeWorkers` decrements and `processNext()` triggers the next pending job.

### Flow 3: Truthful State Polling & Result Display
1. **User Action**: Browser arrives at `/jobs/:id`.
2. **State Display**: The page truthfully displays the badge: `Pending` -> `Processing` -> `Done` or `Failed`.
3. **Client Polling**: While in non-terminal states, a lightweight script polls `GET /api/ai/jobs/:id` every 1.2 seconds.
4. **Presentation**: When `status === 'done'`, the UI renders the structured output: Role Title, Seniority badge, Department, Experience requirements, Technical Skill chips, and Core Responsibilities, alongside a collapsible raw model output inspector.

### Flow 4: Follow-up AI Action (Technical Interview Rubric)
1. **User Action**: On a completed job view, the user clicks "Generate Technical Interview Rubric".
2. **Frontend Payload**: Sends `POST /api/ai/jobs/:id/follow-up`.
3. **Server Execution**: Protected by `followUpLimiter`. Invokes `executeFollowUpAction(jobId)` in [src/ai/worker.js](file:///src/ai/worker.js).
4. **Role 2 Invocation**: Reads `result_json` from the job record. Dispatches inference to Role 2 ("Technical Interview Evaluator") with temperature `0.5`.
5. **Validation & Storage**: Asserts model response against `interviewRubricSchema` using Zod. Updates SQLite: `UPDATE jobs SET follow_up_action = 'interview_rubric', follow_up_result = ?, updated_at = ?`. Returns structured rubric to client and displays the evaluation matrix.

---

# 4. The Data Model

The schema is defined and initialized in [src/db.js](file:///src/db.js):

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  error_message TEXT,
  raw_output TEXT,
  result_json TEXT,
  follow_up_action TEXT,
  follow_up_result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
```

### Table Breakdown
- **`jobs`**: Stores every asynchronous unit of AI work.
  - `id`: UUIDv4 identifier exposed in routing and client polling.
  - `status`: Enforced by `CHECK (status IN ('pending', 'processing', 'done', 'failed'))`.
  - `attempts`: Integer tracking execution attempts (0 to 3).
  - `storage_key`: Filesystem path where uploaded document bytes reside.
  - `error_message`: Human-readable error description when status is `failed`.
  - `raw_output`: Unmodified string returned by the AI provider.
  - `result_json`: Verified, parsed JSON string asserted against Zod schemas.
  - `follow_up_action` & `follow_up_result`: Tracks Role 2 execution.

### Invariant Questions
> **Which constraints in this schema make an invalid state impossible?**
1. `CHECK (status IN ('pending', 'processing', 'done', 'failed'))`: Restricts the job state machine to four valid states, preventing undefined or orphaned lifecycle statuses.
2. `storage_key TEXT NOT NULL`: Guarantees that no job can be created without an existing on-disk storage reference.
3. `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`: Ensures all AI jobs and associated references are purged if a user account is deleted.
4. `NOT NULL` on timestamps and file metadata: Prevents incomplete job telemetry records.
5. Index `idx_jobs_status`: Enables the worker queue to quickly identify pending and processing tasks.

---

# 5. The Concepts

### 5.1 Asynchronous Background Queue vs Synchronous Request Blocking
- **What it is**: Decoupling the HTTP request/response cycle from heavy AI model execution by immediately returning HTTP 202 Accepted and placing the work into an asynchronous worker queue.
- **Why it is needed**: AI model inference typically takes 3 to 15 seconds. If handled synchronously in the HTTP request handler, browser connections time out, HTTP gateway proxies (Cloudflare, Nginx, ALB) drop connections with 504 Gateway Timeout, and server HTTP threads are monopolized.
- **How I implemented it**: In [src/routes/ai.js](file:///src/routes/ai.js) and [src/ai/worker.js](file:///src/ai/worker.js):
  ```javascript
  db.prepare('INSERT INTO jobs (id, user_id, status, storage_key, ...) VALUES (?, ?, "pending", ...)').run(...);
  jobQueue.enqueue(jobId);
  return res.status(202).json({ success: true, jobId, status: 'pending', redirectUrl: `/jobs/${jobId}` });
  ```
- **What I chose against, and why**: I chose against synchronous request execution (`await invokeAiModel(...)` inside the upload handler). Synchronous execution violates resilient backend architecture and leaves clients vulnerable to dropped TCP connections.

### 5.2 Controlled Worker Concurrency Cap
- **What it is**: Enforcing a strict ceiling on the number of AI model inference calls executing concurrently (`MAX_CONCURRENT_JOBS = 2`).
- **Why it is needed**: If a user or automated script uploads 50 job descriptions simultaneously, an unconstrained worker would fire 50 simultaneous API requests to the model provider. This immediately breaches provider rate limits (429 Rate Limit Exceeded), exhausts account token quotas, and incurs massive burst billing charges.
- **How I implemented it**: In [src/ai/worker.js](file:///src/ai/worker.js):
  ```javascript
  async processNext() {
    if (this.activeWorkers >= config.ai.maxConcurrentJobs || this.queue.length === 0) return;
    const jobId = this.queue.shift();
    this.activeWorkers += 1;
    try { await this.runJob(jobId); }
    finally { this.activeWorkers -= 1; this.processNext(); }
  }
  ```
- **What I chose against, and why**: I chose against `Promise.all` over unconstrained arrays. Unconstrained parallel execution offers no backpressure and guarantees provider throttling under burst load.

### 5.3 Application-Side Schema Validation
- **What it is**: Validating model output strings using declared application schemas (Zod) before accepting them as valid application state.
- **Why it is needed**: Large Language Models are probabilistic text generators. Even with "JSON mode" enabled on an API, models can generate missing fields, incorrect data types (e.g. negative years of experience or invalid seniority strings), or truncated JSON. Blindly trusting model output leads to runtime crashes in downstream services.
- **How I implemented it**: In [src/ai/worker.js](file:///src/ai/worker.js):
  ```javascript
  const parsedJson = JSON.parse(rawOutput);
  const validation = jobExtractionSchema.safeParse(parsedJson);
  if (!validation.success) {
    const formatted = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Model output failed schema validation: ${formatted}`);
  }
  ```
- **What I chose against, and why**: I chose against trusting provider-level schema enforcement without local validation. Application-side validation ensures code remains defensive, portable across model providers, and resilient against API drift.

### 5.4 Retry Policy & Honest Failure Reporting
- **What it is**: An automated retry loop for transient model validation or network errors that transitions gracefully to an honest failure state if retries are exhausted.
- **Why it is needed**: If a model returns slightly malformed JSON once, an immediate failure harms user experience. However, infinite retries drain API budgets. When errors persist, displaying generic error pages or masking the failure destroys user trust.
- **How I implemented it**: In [src/ai/worker.js](file:///src/ai/worker.js):
  ```javascript
  while (attempts < maxAttempts && !success) {
    attempts += 1;
    try { /* invoke and validate */ success = true; }
    catch (err) { lastError = err.message; }
  }
  if (!success) {
    db.prepare("UPDATE jobs SET status = 'failed', error_message = ? WHERE id = ?").run(lastError, jobId);
  }
  ```
- **What I chose against, and why**: I chose against silent retries without attempt tracking and against masking failures behind empty output objects. Storing attempt counts and exact error messages provides transparency and operational auditability.

### 5.5 Two Distinct AI Roles & System Prompt Engineering
- **What it is**: Designing two meaningfully different personas with specialized system prompts and tailored inference parameters.
- **Why it is needed**: A single generic prompt cannot excel at both deterministic, factual entity extraction and creative assessment synthesis.
- **How I implemented it**: In [src/ai/prompts.js](file:///src/ai/prompts.js):
  - **Role 1 (Requirements Extractor)**: Temperature `0.2`, Token cap `1024`. Optimized for deterministic, zero-hallucination factual extraction.
  - **Role 2 (Interview Evaluator)**: Temperature `0.5`, Token cap `1024`. Optimized for creative evaluation rubric synthesis and targeted interview questions.
- **What I chose against, and why**: I chose against using a single universal prompt for both steps. Separating extraction from evaluation creates a clear architectural pipeline where each role is tuned for its specific cognitive task.

### 5.6 Storage Key Abstraction
- **What it is**: Storing uploaded files in dedicated object/filesystem storage and persisting only the storage key/path in the relational database.
- **Why it is needed**: Storing binary documents or large text files directly in database `BLOB`/`TEXT` columns causes severe database bloat, degrades WAL/journal performance, slows down table scans, and inflates backup file sizes.
- **How I implemented it**: In [src/routes/ai.js](file:///src/routes/ai.js): Multer writes files to disk at `storage/uploads/`. The SQLite query executes:
  ```javascript
  db.prepare('INSERT INTO jobs (id, user_id, storage_key, ...) VALUES (?, ?, ?, ...)').run(jobId, req.user.id, req.file.path, ...);
  ```
- **What I chose against, and why**: I chose against storing file contents directly in a `file_content` database column. The storage key pattern maintains database efficiency and mirrors production S3/GCS architectures.

### 5.7 Timeout Enforcement with AbortController
- **What it is**: Setting a hard deadline (10,000ms) on model calls using native `AbortController` signals and race conditions.
- **Why it is needed**: AI provider endpoints frequently suffer from tail-latency spikes, connection hangs, or cold-start freezes. Without timeouts, worker threads hang indefinitely, blocking subsequent jobs in the queue.
- **How I implemented it**: In [src/ai/provider.js](file:///src/ai/provider.js):
  ```javascript
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try { return await Promise.race([ executeModelCall({ signal: controller.signal }), ... ]); }
  finally { clearTimeout(timeoutId); }
  ```
- **What I chose against, and why**: I chose against relying on default HTTP client timeouts (which often exceed 60 to 120 seconds). Explicit 10-second deadlines ensure that hung requests are promptly severed and retried.

---

# 6. What Went Wrong

### Problem 1
- **Symptom**: During automated testing of `tests/ai.test.js`, PowerShell threw `touch : The term 'touch' is not recognized` when attempting to create `storage/uploads/.gitkeep`.
- **Investigation**: Inspected shell environment. On Windows PowerShell, the Unix utility `touch` does not exist by default unless installed via MinGW/Git Bash.
- **Cause**: Cross-platform shell discrepancy when porting Unix setup commands to Windows PowerShell.
- **Fix**: Replaced shell `touch` invocation with a native Node.js filesystem write via `write_to_file`, creating `storage/uploads/.gitkeep` with zero operating system dependencies.

### Problem 2
- **Symptom**: Integration tests verifying schema validation failure initially passed prematurely without asserting retry attempt counts.
- **Investigation**: Checked `tests/ai.test.js`. Discovered that the test completed immediately on the first failure rather than waiting for the worker's retry loop to exhaust `maxRetries = 2`.
- **Cause**: The polling condition in the test harness checked `if (job && job.status === 'failed')`, but the worker only updates status to `'failed'` after all retries are exhausted. During intermediate retries, status remained `'processing'`.
- **Fix**: Corrected the test assertion to verify `failedJob.attempts === 3`, verifying that the worker executed the initial attempt plus two configured retries before recording terminal failure.

### Problem 3
- **Symptom**: Enqueuing 10 jobs simultaneously in the concurrency test initially finished faster than expected without observing worker queue depth.
- **Investigation**: Inspected `JobQueue.peakConcurrency`. In offline test mode with zero artificial latency, jobs were executing synchronously in under 2ms, meaning worker 1 finished before worker 2 could be dispatched.
- **Cause**: Lack of realistic simulated inference delay in the test provider harness prevented concurrency overlap.
- **Fix**: Added an explicit 80ms simulated inference latency in `executeModelCall` within [src/ai/provider.js](file:///src/ai/provider.js). This allowed the concurrency queue to actively interleave tasks and reliably prove that peak concurrent workers never exceeded `MAX_CONCURRENT_JOBS = 2`.

---

# 7. What This Slice Does Not Handle

1. **Persistent Distributed Queue (e.g. BullMQ / Redis)**: The background worker utilizes an in-memory queue. In a server restart, queued in-memory jobs would need a database recovery worker to pick up orphaned `pending` rows.
2. **Streaming Server-Sent Events (SSE)**: Results are polled via periodic HTTP requests (`/api/ai/jobs/:id`) rather than streamed via SSE or WebSockets.
3. **Multi-Model Fallback Routing**: If the primary model provider experiences a widespread outage, the system does not automatically fail over to an alternative provider (e.g. switching from OpenAI to Anthropic).
4. **Binary PDF / OCR Parsing**: The upload view accepts structured text formats (`.txt`, `.md`, `.json`). Binary PDF text extraction and vision-based OCR were excluded to prevent dependency bloat.
5. **Dynamic Concurrency Auto-Scaling**: The concurrency cap is statically configured in `config.js` (`MAX_CONCURRENT_JOBS = 2`) rather than dynamically scaling based on CPU metrics or provider rate limit headers (`x-ratelimit-remaining-requests`).

---

# 8. If I Built This Again

If I built this AI integration slice again, I would implement an event-driven database polling mechanism (such as SQLite row change hooks or Postgres `LISTEN`/`NOTIFY`) paired with an Redis-backed distributed queue to ensure that background tasks survive server crashes and can scale horizontally across multiple worker nodes without risking duplicate job execution.
