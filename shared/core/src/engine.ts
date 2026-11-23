import instructions from '../../prompts/instructions.json' with { type: 'json' };
import {
  parseModelJson, parseRubricResponse, validateExam, validateGrade, validatePack,
  type ExamMetadata, type GradingPack, type GradingResult, type QuestionRubric,
} from './contracts.ts';

export const MAX_DOCUMENT_CHARS = 30_000;
export const MAX_ANSWER_CHARS = 12_000;
const MAX_DEVICE_PROMPT_CHARS = 7_000;

export type Policy = 'prefer-device' | 'device-only' | 'cloud-only' | 'cloud-first';
export type Source = 'device' | 'cloud' | 'unknown';
export type InferenceUsage = { inputTokens: number; outputTokens: number };
export type Receipt = { source: Source; text: string; usage?: InferenceUsage };
export type Attempt = {
  source: Source;
  requestedSource?: 'device' | 'cloud';
  latencyMs: number;
  promptChars: number;
  responseChars?: number;
  usage?: InferenceUsage;
  result?: GradingResult;
  error?: string;
};
export type Evaluation = {
  status: 'provisional' | 'review' | 'pending';
  attempts: Attempt[];
  proposed?: GradingResult;
  warnings: string[];
};
export type EvaluationOptions = {
  policy: Policy;
  cloudConsent: boolean;
  online: boolean;
  extractionVerified?: boolean;
};
export interface Inference {
  readonly cloudConfigured: boolean;
  initializeDevice(onProgress?: (fraction: number) => void): Promise<void>;
  deviceAvailability(): Promise<string>;
  generate(source: 'device' | 'cloud', kind: 'rubric' | 'grade' | 'probe', prompt: string): Promise<Receipt>;
  extractImage?(bytes: Uint8Array, mimeType: 'image/png' | 'image/jpeg'): Promise<string>;
}

export async function generatePack(
  inference: Inference, rawExam: ExamMetadata, rawPaper: string, rawKey: string,
  onAttempt?: (attempt: Attempt) => void,
): Promise<GradingPack> {
  const exam = validateExam(rawExam);
  const paper = rawPaper.trim();
  const answerKey = rawKey.trim();
  if (!paper || !answerKey) throw new Error('Enter the question paper and answer key.');
  if (paper.length > MAX_DOCUMENT_CHARS || answerKey.length > MAX_DOCUMENT_CHARS) {
    throw new Error(`The paper and key must each be at most ${MAX_DOCUMENT_CHARS.toLocaleString()} characters.`);
  }
  if (!inference.cloudConfigured) throw new Error('Set up Firebase App Check to generate a rubric.');
  const prompt = makePrompt(instructions.rubric, { exam, paper, answerKey });
  const { attempt, receipt } = await invoke(inference, 'cloud', 'rubric', prompt);
  let pack: GradingPack;
  try {
    if (!receipt) throw new Error(attempt.error);
    const { questions } = parseRubricResponse(parseModelJson(receipt.text));
    pack = validatePack({ schemaVersion: 1, exam, questions, approvedAt: null });
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : 'The rubric did not pass validation.';
    throw new Error(attempt.error);
  } finally {
    onAttempt?.(attempt);
  }
  return pack;
}

const route: Record<Policy, readonly ('device' | 'cloud')[]> = {
  'prefer-device': ['device', 'cloud'],
  'device-only': ['device'],
  'cloud-only': ['cloud'],
  'cloud-first': ['cloud', 'device'],
};

export async function evaluateAnswer(
  inference: Inference, rubric: QuestionRubric, rawAnswer: string, options: EvaluationOptions,
): Promise<Evaluation> {
  const answer = rawAnswer.trim();
  const attempts: Attempt[] = [];
  const warnings: string[] = [];
  if (options.extractionVerified === false) {
    return { status: 'review', attempts, warnings: ['Verify the extracted answer before inference.'] };
  }
  if (!/[\p{L}\p{N}]/u.test(answer) || answer.length > MAX_ANSWER_CHARS) {
    return { status: 'review', attempts, warnings: ['The answer is blank, unreadable, or exceeds the grading input limit.'] };
  }

  const prompt = makePrompt(instructions.grade, { rubric, answer });
  let proposed: GradingResult | undefined;
  let pending = false;
  for (const source of route[options.policy]) {
    if (source === 'cloud') {
      const reason = cloudBlock(inference, options);
      if (reason) {
        warnings.push(reason);
        pending = true;
        continue;
      }
    }
    if (source === 'device' && prompt.length > MAX_DEVICE_PROMPT_CHARS) {
      warnings.push('This answer and rubric exceed the on-device prompt limit.');
      continue;
    }

    const { attempt, receipt } = await invoke(inference, source, 'grade', prompt);
    attempts.push(attempt);
    if (!receipt) {
      warnings.push(attempt.error ?? 'Inference failed.');
      continue;
    }
    try {
      attempt.result = validateGrade(parseModelJson(receipt.text), rubric, answer);
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : 'The proposed grade did not pass validation.';
      warnings.push(attempt.error);
      continue;
    }

    const previous = proposed;
    const result = attempt.result;
    proposed = result;
    if (previous && haveDisagreement(previous, result)) {
      warnings.push('Device and cloud models awarded different marks. Review both attempts.');
      return { status: 'review', attempts, proposed, warnings };
    }
    if (result.uncertain) {
      warnings.push(`The ${source === 'device' ? 'on-device' : 'cloud'} model flagged uncertainty.`);
      continue;
    }
    const cloudWasUncertain = attempts.some(({ source, result }) => source === 'cloud' && result?.uncertain);
    return { status: cloudWasUncertain ? 'review' : 'provisional', attempts, proposed, warnings };
  }
  return { status: pending ? 'pending' : 'review', attempts, proposed, warnings };
}

function cloudBlock(inference: Inference, options: EvaluationOptions) {
  if (!options.cloudConsent) return 'Cloud inference is waiting for teacher consent.';
  if (!options.online) return 'Cloud inference is waiting for an internet connection.';
  if (!inference.cloudConfigured) return 'Cloud inference is waiting for Firebase configuration.';
}

function haveDisagreement(first: GradingResult, second: GradingResult) {
  return first.marks !== second.marks || first.criteria.some(
    (criterion) => second.criteria.find(({ criterionId }) => criterionId === criterion.criterionId)?.marks !== criterion.marks,
  );
}

function makePrompt(instruction: string, input: object) {
  return `${instruction}\nINPUT\n${JSON.stringify(input)}`;
}

async function invoke(
  inference: Inference, source: 'device' | 'cloud', kind: 'rubric' | 'grade', prompt: string,
): Promise<{ attempt: Attempt; receipt?: Receipt }> {
  const started = performance.now();
  let observed: Receipt | undefined;
  const measured = (): Attempt => ({
    source: observed?.source ?? 'unknown',
    requestedSource: source,
    latencyMs: Math.round(performance.now() - started),
    promptChars: prompt.length,
    responseChars: observed?.text.length,
    usage: observed?.usage,
  });
  try {
    observed = await inference.generate(source, kind, prompt);
    if (observed.source !== source) {
      return { attempt: { ...measured(), error: 'Firebase did not confirm the requested inference source.' } };
    }
    return { attempt: measured(), receipt: observed };
  } catch (error) {
    const diagnostic = error instanceof InferenceFailure ? error.message : 'The model request failed.';
    return { attempt: { ...measured(), error: diagnostic } };
  }
}

/** A safe, actionable error string from the platform inference adapter. */
export class InferenceFailure extends Error {}
