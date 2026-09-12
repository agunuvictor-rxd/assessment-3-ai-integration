# LinkedIn Post — Assessment 3: AI Integration Slice

**Why you should never trust your LLM's JSON mode (and how we engineered defensive AI worker pipelines)**

Almost every tutorial on integrating AI models shows the same pattern: you send a prompt with `response_format: { type: "json_object" }`, parse the output with `JSON.parse()`, and immediately save it to your database.

The hidden danger? "JSON mode" only guarantees syntactically valid JSON. It does NOT guarantee that the fields actually match your application schema. A model can return negative numbers for years of experience, omit critical required fields, or substitute string arrays with nested objects—instantly crashing your frontend or corrupting downstream services.

For the third milestone of our Product Engineering Bootcamp, I built an asynchronous AI Integration Slice in Node.js and SQLite that analyzes job specifications and synthesizes technical interview rubrics.

We adopted a strictly defensive engineering posture:
1. **Never trust provider schema enforcement**: Every model response is asserted against strict Zod schemas directly in application code.
2. **Automated retry with backoff**: If a model returns invalid schema types, the background worker catches the Zod validation error, increments the attempt count (capped at `MAX_RETRIES = 2`), and re-prompts the model. If retries are exhausted, the job transitions gracefully to a `failed` state with the exact validation error recorded in SQLite.
3. **Controlled worker concurrency**: If a user uploads 50 files at once, we return HTTP `202 Accepted` immediately and offload processing to an asynchronous queue with `MAX_CONCURRENT_JOBS = 2`. Exactly two provider calls execute in parallel at any given second, preventing rate limit breaches (HTTP 429) and unpredictable cost spikes.

We also separated responsibilities into two distinct AI roles with specialized system prompts: Role 1 (Extraction) runs at temperature `0.2` for zero-hallucination factual fidelity, while Role 2 (Interview Rubric Synthesis) runs at temperature `0.5` for creative question formulation.

Check out the architecture, concurrency test suites, and reproducible failure evidence:
https://github.com/developer/assessment-3-ai-integration

#SoftwareEngineering #ArtificialIntelligence #NodeJS #SystemDesign #BackendEngineering #LLMOps
