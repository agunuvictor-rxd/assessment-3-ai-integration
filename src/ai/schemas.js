import { z } from 'zod';

export const jobExtractionSchema = z.object({
  roleTitle: z
    .string({ required_error: 'roleTitle is required' })
    .trim()
    .min(2, 'Role title must be at least 2 characters')
    .max(100, 'Role title is too long'),
  seniority: z.enum(['Junior', 'Mid', 'Senior', 'Staff', 'Lead'], {
    required_error: 'seniority level is required',
  }),
  department: z
    .string({ required_error: 'department is required' })
    .trim()
    .min(2, 'Department is required')
    .max(100),
  requiredSkills: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one required skill must be listed'),
  minYearsExperience: z
    .number({ required_error: 'minYearsExperience is required' })
    .int()
    .min(0, 'Years of experience cannot be negative')
    .max(30, 'Unrealistic years of experience'),
  responsibilities: z
    .array(z.string().trim().min(5))
    .min(1, 'At least one responsibility is required'),
});

export const interviewRubricSchema = z.object({
  roleTitle: z.string().trim().min(2),
  competencies: z
    .array(
      z.object({
        name: z.string().trim().min(2),
        criteria: z.array(z.string().trim().min(5)).min(1),
        assessmentQuestions: z.array(z.string().trim().min(5)).min(1),
      })
    )
    .min(1, 'At least one competency is required'),
  scoringGuidelines: z.object({
    junior: z.string().trim().min(5),
    senior: z.string().trim().min(5),
  }),
});
