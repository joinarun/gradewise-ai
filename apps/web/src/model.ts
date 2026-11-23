import type { Attempt, Evaluation, ExamMetadata, GradingPack, Policy } from "@gradewise/core";

export interface AnswerRecord {
  id: string;
  student: string;
  questionId: string;
  text: string;
  extractionVerified: boolean;
  reference?: number;
  evaluation?: Evaluation;
  final?: { marks: number; override: boolean; at: string; note: string };
  rejected?: boolean;
  runningAt?: number;
}

export interface ExamRecord {
  id: string;
  metadata: ExamMetadata;
  paper: string;
  key: string;
  pack?: GradingPack;
  rubricAttempts?: Attempt[];
  answers: AnswerRecord[];
  createdAt: string;
  sample?: boolean;
}

export interface Settings {
  policy: Policy;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
}

export interface Workspace {
  revision: number;
  exams: ExamRecord[];
  settings: Settings;
}

export const defaultWorkspace: Workspace = {
  revision: 0,
  exams: [],
  settings: {
    policy: "prefer-device",
    inputPerMillion: 0.30,
    outputPerMillion: 2.50,
  },
};

export const policyLabels: Record<Policy, string> = {
  "prefer-device": "Prefer on-device",
  "device-only": "On-device only",
  "cloud-first": "Cloud first",
  "cloud-only": "Cloud only",
};

export function answerLabel(answer: AnswerRecord) {
  if (answer.final) return answer.final.override ? "Overridden" : "Finalized";
  if (answer.rejected) return "Rejected";
  if (answer.runningAt) return "Evaluating";
  if (answer.evaluation?.status === "provisional") return "Ready for review";
  if (answer.evaluation?.status === "review") return "Needs review";
  if (answer.evaluation?.status === "pending") return "Pending retry";
  return "Queued";
}

export function examLabel(exam: ExamRecord) {
  if (!exam.pack?.approvedAt) return exam.pack ? "Rubric draft" : "Setup";
  if (!exam.answers.length) return "Rubric approved";
  if (exam.answers.every((answer) => answer.final)) return "Finalized";
  return "In progress";
}

export function uniqueStudentKey(student: string) {
  return student.normalize("NFKC").trim().toLocaleLowerCase("en");
}

export function uniqueAnswerKey(student: string, questionId: string) {
  return JSON.stringify([uniqueStudentKey(student), questionId]);
}

export function dateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function finalizeAnswer(answer: AnswerRecord, marks: number, note: string, override: boolean) {
  return {
    ...answer,
    final: { marks, note, override, at: new Date().toISOString() },
    rejected: false,
  };
}
