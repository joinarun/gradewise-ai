import { z } from 'zod';

const text = (limit: number) => z.string().trim().min(1).max(limit);
const identifier = text(40).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.()-]*$/);
const marks = z.number().min(0).max(1_000).multipleOf(0.5);
const positiveMarks = marks.min(0.5);
const stringList = (limit: number) => z.array(text(limit)).max(12);

export const examSchema = z.strictObject({
  name: text(160),
  subject: text(100),
  className: text(100),
  date: z.iso.date(),
  maxMarks: positiveMarks,
  autoApprove: z.boolean(),
});

export const criterionSchema = z.strictObject({
  id: identifier,
  description: text(500),
  maxMarks: positiveMarks,
  partialCredit: text(500),
});

export const questionSchema = z.strictObject({
  id: identifier,
  text: text(2_000),
  referenceAnswer: text(2_000),
  maxMarks: positiveMarks,
  criteria: z.array(criterionSchema).min(1).max(16),
  alternatives: stringList(400),
  examples: z.strictObject({ correct: stringList(400), incorrect: stringList(400) }),
  constraints: stringList(500),
});

export const rubricResponseSchema = z.strictObject({
  questions: z.array(questionSchema).min(1).max(60),
});

export const packSchema = z.strictObject({
  schemaVersion: z.literal(1),
  exam: examSchema,
  questions: rubricResponseSchema.shape.questions,
  approvedAt: z.iso.datetime().nullable(),
});

export const gradeSchema = z.strictObject({
  marks,
  explanation: text(1_200),
  criteria: z.array(z.strictObject({
    criterionId: identifier,
    marks,
    evidence: z.string().trim().max(600),
  })).min(1).max(16),
  uncertain: z.boolean(),
});

export type ExamMetadata = z.infer<typeof examSchema>;
export type Criterion = z.infer<typeof criterionSchema>;
export type QuestionRubric = z.infer<typeof questionSchema>;
export type GradingPack = z.infer<typeof packSchema>;
export type GradingResult = z.infer<typeof gradeSchema>;

function parseContract<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.') || 'response';
    throw new Error(`Invalid ${field} (${issue.code}).`);
  }
  return result.data;
}

export function parseModelJson(input: string): unknown {
  const trimmed = input.trim();
  const body = /^\x60{3}(?:json)?\s*([\s\S]+?)\s*\x60{3}$/i.exec(trimmed)?.[1] ?? trimmed;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('The model did not return valid JSON.');
  }
}

function ensureUnique(ids: string[], label: string) {
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
    throw new Error(`Duplicate ${label} identifiers.`);
  }
}

export function validatePack(input: unknown, expectedExam?: ExamMetadata): GradingPack {
  const pack = parseContract(packSchema, input);
  if (expectedExam) {
    const expected = parseContract(examSchema, expectedExam);
    for (const field of Object.keys(expected) as (keyof ExamMetadata)[]) {
      if (pack.exam[field] !== expected[field]) throw new Error('Rubric metadata differs from this exam.');
    }
  }
  ensureUnique(pack.questions.map(({ id }) => id), 'question');
  let sum = 0;
  for (const question of pack.questions) {
    ensureUnique(question.criteria.map(({ id }) => id), 'criterion');
    const criteriaMarks = question.criteria.reduce((points, criterion) => points + criterion.maxMarks, 0);
    if (criteriaMarks !== question.maxMarks) throw new Error(`Question ${question.id} has inconsistent criterion marks.`);
    sum += question.maxMarks;
  }
  if (sum !== pack.exam.maxMarks) throw new Error('Question marks do not add up to the exam maximum.');
  return pack;
}

function normalizeEvidence(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function validateGrade(input: unknown, rubric: QuestionRubric, answer: string): GradingResult {
  const result = parseContract(gradeSchema, input);
  ensureUnique(result.criteria.map(({ criterionId }) => criterionId), 'scored criterion');
  const criteria = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  if (result.criteria.length !== criteria.size) throw new Error('Model did not score every criterion.');
  const normalized = normalizeEvidence(answer);
  let sum = 0;
  for (const score of result.criteria) {
    const criterion = criteria.get(score.criterionId);
    if (!criterion || score.marks > criterion.maxMarks) throw new Error('Model returned an invalid criterion score.');
    const evidence = normalizeEvidence(score.evidence);
    if (score.marks && (!/[\p{L}\p{N}]/u.test(evidence) || !normalized.includes(evidence))) {
      throw new Error('An awarded criterion is missing evidence from the answer.');
    }
    sum += score.marks;
  }
  if (result.marks !== sum || sum > rubric.maxMarks) throw new Error('Model returned an inconsistent total.');
  return result;
}

export function validateExam(input: unknown): ExamMetadata {
  return parseContract(examSchema, input);
}

export function parseRubricResponse(input: unknown) {
  return parseContract(rubricResponseSchema, input);
}

export function approvePack(pack: GradingPack): GradingPack {
  return { ...validatePack(pack), approvedAt: new Date().toISOString() };
}
