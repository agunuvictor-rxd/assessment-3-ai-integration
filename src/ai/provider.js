import { config } from '../config.js';
import { role1Prompt, role2Prompt } from './prompts.js';

let testSimulationMode = null; // null | 'timeout' | 'invalid_json' | 'invalid_schema'

export function setTestSimulationMode(mode) {
  testSimulationMode = mode;
}

/**
 * Invokes the AI model with strict timeout enforcement and prompt boundaries.
 */
export async function invokeAiModel({ promptRole, userContent, timeoutMs = config.ai.timeoutMs }) {
  if (testSimulationMode === 'timeout') {
    // Deliberately exceed the timeout
    await new Promise((resolve) => setTimeout(resolve, timeoutMs + 50));
    throw new Error(`AI Provider timed out after ${timeoutMs}ms`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const rawResult = await Promise.race([
      executeModelCall({ promptRole, userContent, signal: controller.signal }),
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`AI Provider timed out after ${timeoutMs}ms`));
        });
      }),
    ]);

    clearTimeout(timeoutId);
    return rawResult;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Underlying model call. If a live API key is present, calls the provider API.
 * Otherwise, uses a deterministic, rule-based inference parser for offline test mode.
 */
async function executeModelCall({ promptRole, userContent, signal }) {
  if (testSimulationMode === 'invalid_json') {
    return 'This is broken, unparseable JSON from model { "roleTitle": ';
  }

  if (testSimulationMode === 'invalid_schema') {
    // Violates schema (missing required fields, negative years experience)
    return JSON.stringify({
      roleTitle: 'X', // too short (< 2 chars)
      seniority: 'ChiefExecutiveOfficer', // not in allowed enum
      minYearsExperience: -5, // negative number violates min(0)
      responsibilities: [], // empty array violates min(1)
    });
  }

  if (config.ai.apiKey && !process.env.TEST_FORCE_SIMULATOR) {
    // Official provider invocation (e.g. OpenAI / Gemini endpoint)
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify({
          model: config.ai.modelName,
          temperature: promptRole.temperature,
          max_tokens: promptRole.maxTokens,
          messages: [
            { role: 'system', content: promptRole.systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Provider API HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '{}';
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`AI Provider timed out after ${config.ai.timeoutMs}ms`);
      throw err;
    }
  }

  // Realistic deterministic offline parser (simulated model execution)
  await new Promise((resolve) => setTimeout(resolve, 80)); // Simulate inference latency

  if (promptRole.name === 'Requirements Extractor') {
    return simulateExtraction(userContent);
  } else {
    return simulateRubricGeneration(userContent);
  }
}

function simulateExtraction(text) {
  const lower = text.toLowerCase();
  let roleTitle = 'Senior Full Stack Engineer';
  if (lower.includes('frontend')) roleTitle = 'Senior Frontend Engineer';
  else if (lower.includes('backend')) roleTitle = 'Senior Backend Engineer';
  else if (lower.includes('devops')) roleTitle = 'Staff DevOps Engineer';

  let seniority = 'Senior';
  if (lower.includes('junior')) seniority = 'Junior';
  else if (lower.includes('staff')) seniority = 'Staff';
  else if (lower.includes('lead')) seniority = 'Lead';
  else if (lower.includes('mid-level') || lower.includes('mid level')) seniority = 'Mid';

  const skills = [];
  if (lower.includes('node') || lower.includes('javascript') || lower.includes('typescript')) skills.push('Node.js', 'TypeScript');
  if (lower.includes('python')) skills.push('Python');
  if (lower.includes('react')) skills.push('React');
  if (lower.includes('sql') || lower.includes('postgres') || lower.includes('sqlite')) skills.push('SQL', 'PostgreSQL');
  if (lower.includes('docker') || lower.includes('kubernetes')) skills.push('Docker', 'Kubernetes');
  if (skills.length === 0) skills.push('Software Engineering', 'System Architecture');

  return JSON.stringify({
    roleTitle,
    seniority,
    department: 'Engineering',
    requiredSkills: skills,
    minYearsExperience: seniority === 'Junior' ? 1 : seniority === 'Mid' ? 3 : 5,
    responsibilities: [
      'Design, build, and maintain high-performance backend microservices.',
      'Collaborate with product and QA engineers to deliver resilient software slices.',
      'Enforce security best practices, database integrity, and automated test coverage.',
    ],
  });
}

function simulateRubricGeneration(jsonText) {
  let parsed = {};
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {}

  const title = parsed.roleTitle || 'Senior Software Engineer';
  const skills = parsed.requiredSkills || ['System Design', 'Backend Engineering'];

  return JSON.stringify({
    roleTitle: title,
    competencies: [
      {
        name: 'Technical Architecture & Fundamentals',
        criteria: [
          `Demonstrates strong hands-on proficiency with ${skills.slice(0, 2).join(' and ')}.`,
          'Explains system boundaries, database constraints, and error-handling strategies clearly.',
        ],
        assessmentQuestions: [
          `How would you design a rate-limited queueing system in ${skills[0] || 'Node.js'} to handle 1,000 bursts/sec?`,
          'Describe a situation where database constraints prevented a critical race condition.',
        ],
      },
      {
        name: 'Failure Modes & Resiliency',
        criteria: [
          'Understands timeout handling, exponential backoff, and idempotent consumers.',
          'Considers telemetry, logging, and reproducible test evidence.',
        ],
        assessmentQuestions: [
          'What happens when a downstream AI provider takes 20 seconds to respond? How do you isolate the caller?',
          'Walk through your strategy for handling schema validation failures on unstructured model outputs.',
        ],
      },
    ],
    scoringGuidelines: {
      junior: 'Answers with functional code but misses edge cases, concurrency caps, or database constraint protections.',
      senior: 'Consistently evaluates failure modes, latency impacts, idempotent keys, and strict validation boundaries.',
    },
  });
}
