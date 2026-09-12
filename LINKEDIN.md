# LinkedIn Post — Metis Bootcamp Assessment 3: AI Integration Slice

🤖 **Metis Academic Co-Pilot — Assessment 3: Structured AI Pipelines & Concurrency Architecture**

Why relying on unvalidated LLM output will break your product (and how we built schema validation resilience in Node.js).

For the third milestone of the **Metis Academic Co-Pilot** build, I engineered the **AI Integration Slice** for **Kinase**, Metis's AI study engine. Kinase converts raw undergraduate course material (syllabi, slides, study notes) into structured study summaries, flashcard decks, and practice quizzes.

### Key AI Engineering Accomplishments:
1. **Runtime Zod Schema Validation**: LLM outputs are validated against strict Zod schemas before being returned to students. If output parsing fails, an automated retry strategy re-prompts the model with explicit schema reminders.
2. **Prompt Injection Guardrails**: Sanitizes incoming study materials to prevent system prompt overrides or context leaks.
3. **Async Background Queue & Concurrency Caps**: Decouples document uploads from AI processing using an async job queue with strict worker concurrency limits (`maxConcurrentJobs = 2`), protecting upstream API rate limits.
4. **Latency & Token Metrics Profiling**: Tracks token consumption and inference latency in SQLite for performance auditing.

#AI #MachineLearning #NodeJS #Metis #LLM #Zod #SoftwareEngineering #BackendDevelopment #PromptEngineering
