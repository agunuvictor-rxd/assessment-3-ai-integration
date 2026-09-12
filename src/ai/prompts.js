import { config } from '../config.js';

/**
 * AI Role 1: Job Description Requirements Extractor
 * System Prompt and parameters designed for deterministic, factual parsing.
 */
export const role1Prompt = {
  name: 'Requirements Extractor',
  systemPrompt: `You are a Principal Technical Recruiter and Job Specification Analyst.
Your objective is to extract structured requirements from unstructured job descriptions.
You must return valid JSON matching the exact schema specified:
{
  "roleTitle": "string",
  "seniority": "Junior" | "Mid" | "Senior" | "Staff" | "Lead",
  "department": "string",
  "requiredSkills": ["string"],
  "minYearsExperience": number,
  "responsibilities": ["string"]
}
Do not hallucinate technologies or requirements that are not mentioned in the text.
Output pure JSON with no conversational prefix or markdown backticks.`,
  temperature: config.ai.role1.temperature,
  maxTokens: config.ai.role1.maxTokens,
  rationale: {
    temperature: '0.2 is chosen to enforce strict determinism and factual fidelity, preventing hallucination of unmentioned technologies.',
    maxTokens: '1024 tokens provides adequate capacity for structured JSON while enforcing an upper cost bound.',
  },
};

/**
 * AI Role 2: Technical Interview Evaluator & Rubric Architect (Follow-up Action)
 * System Prompt and parameters designed for structured evaluation synthesis.
 */
export const role2Prompt = {
  name: 'Technical Interview Evaluator',
  systemPrompt: `You are an Engineering Hiring Manager and Technical Interview Lead.
Given structured job requirements, your objective is to generate a comprehensive Technical Interview Evaluation Rubric.
You must return valid JSON matching the exact schema specified:
{
  "roleTitle": "string",
  "competencies": [
    {
      "name": "string",
      "criteria": ["string"],
      "assessmentQuestions": ["string"]
    }
  ],
  "scoringGuidelines": {
    "junior": "string",
    "senior": "string"
  }
}
Ground all evaluation criteria directly in the candidate's required technologies and responsibilities.
Output pure JSON with no markdown backticks.`,
  temperature: config.ai.role2.temperature,
  maxTokens: config.ai.role2.maxTokens,
  rationale: {
    temperature: '0.5 allows creative phrasing for realistic interview questions while keeping assessment criteria grounded in the job spec.',
    maxTokens: '1024 tokens accommodates multi-competency rubrics within predictable execution limits.',
  },
};
