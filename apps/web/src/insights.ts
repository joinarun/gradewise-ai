import type { ExamRecord, Settings } from "./model";
import { uniqueStudentKey } from "./model.ts";

function cost(input: number, output: number, rates: Settings) {
  if (rates.inputPerMillion === null || rates.outputPerMillion === null) return null;
  return (input * rates.inputPerMillion + output * rates.outputPerMillion) / 1_000_000;
}

export function workspaceInsights(exams: ExamRecord[], rates: Settings) {
  const entries = exams.flatMap((exam) => exam.answers.map((answer) => ({ exam, answer })));
  const rubricAttempts = exams.flatMap((exam) => exam.rubricAttempts ?? []);
  const attempts = [...rubricAttempts, ...entries.flatMap(({ answer }) => answer.evaluation?.attempts ?? [])];
  const device = attempts.filter((attempt) => attempt.source === "device").length;
  const cloud = attempts.filter((attempt) => attempt.source === "cloud").length;
  const failures = attempts.filter((attempt) => attempt.error).length;
  const evaluated = entries.filter(({ answer }) => !!answer.evaluation?.proposed);
  const finalized = entries.filter(({ answer }) => !!answer.final);
  const benchmark = evaluated.filter(({ answer }) => answer.reference !== undefined);
  const totalLatency = attempts.reduce((total, attempt) => total + attempt.latencyMs, 0);
  const cloudResponses = attempts.filter((attempt) => attempt.source === "cloud");
  let cloudInput = 0;
  let cloudOutput = 0;
  let estimatedCloudResponses = 0;
  for (const attempt of cloudResponses) {
    cloudInput += attempt.usage?.inputTokens ?? Math.ceil(attempt.promptChars / 4);
    cloudOutput += attempt.usage?.outputTokens ?? Math.ceil((attempt.responseChars ?? JSON.stringify(attempt.result ?? "").length) / 4);
    if (!attempt.usage) estimatedCloudResponses++;
  }
  const avoided = evaluated.flatMap(({ answer }) => {
    if (answer.evaluation?.status !== "provisional") return [];
    const attempts = answer.evaluation?.attempts ?? [];
    if (attempts.some((attempt) => attempt.source === "cloud")) return [];
    const accepted = attempts.findLast((attempt) => attempt.source === "device" && !attempt.error && !!attempt.result);
    return accepted ? [accepted] : [];
  });
  const avoidedInput = avoided.reduce((sum, attempt) => sum + Math.ceil(attempt.promptChars / 4), 0);
  const avoidedOutput = avoided.reduce((sum, attempt) => sum + Math.ceil((attempt.responseChars ?? JSON.stringify(attempt.result).length) / 4), 0);
  return {
    exams: exams.length,
    students: new Set(evaluated.map(({ exam, answer }) => JSON.stringify([exam.id, uniqueStudentKey(answer.student)]))).size,
    questions: new Set(evaluated.map(({ exam, answer }) => JSON.stringify([exam.id, answer.questionId]))).size,
    answers: evaluated.length,
    finalized: finalized.length,
    queued: entries.filter(({ answer }) => !answer.final && !answer.rejected).length,
    needsReview: entries.filter(({ answer }) => !answer.final && !answer.rejected && !!answer.evaluation).length,
    device,
    cloud,
    cloudRubricRequests: rubricAttempts.filter((attempt) => attempt.source === "cloud").length,
    failures,
    unknown: attempts.filter((attempt) => attempt.source === "unknown").length,
    latencyMs: attempts.length ? totalLatency / attempts.length : null,
    escalated: entries.filter(({ answer }) => {
      const attempts = answer.evaluation?.attempts ?? [];
      const firstDevice = attempts.findIndex((attempt) => (attempt.requestedSource ?? attempt.source) === "device");
      return firstDevice >= 0 && attempts.slice(firstDevice + 1).some((attempt) => attempt.source === "cloud");
    }).length,
    escalationBase: entries.filter(({ answer }) => answer.evaluation?.attempts.some((attempt) => (attempt.requestedSource ?? attempt.source) === "device")).length,
    overrides: finalized.filter(({ answer }) => answer.final?.override).length,
    overrideBase: finalized.filter(({ answer }) => !!answer.evaluation?.proposed).length,
    benchmark: benchmark.length,
    agreement: benchmark.filter(({ answer }) => answer.evaluation?.proposed?.marks === answer.reference).length,
    cloudInput,
    cloudOutput,
    estimatedCloudResponses,
    estimatedCloudCost: cost(cloudInput, cloudOutput, rates),
    estimatedCloudAvoided: cost(avoidedInput, avoidedOutput, rates),
    avoidedCalls: avoided.length,
  };
}

export function classResults(exam: ExamRecord) {
  const rows = new Map<string, { student: string; marks: number; finalized: number; submitted: number }>();
  for (const answer of exam.answers) {
    const key = uniqueStudentKey(answer.student);
    const row = rows.get(key) ?? { student: answer.student, marks: 0, finalized: 0, submitted: 0 };
    row.submitted++;
    if (answer.final) {
      row.marks += answer.final.marks;
      row.finalized++;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.student.localeCompare(b.student, "en", { numeric: true }));
}

function csvCell(value: string | number) {
  const content = String(value);
  const safe = typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/u.test(content) ? "'" + content : content;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function finalizedCsv(exam: ExamRecord) {
  const lines = [
    ["Examination", "Student", "Question", "Final Marks", "Maximum Marks", "Finalized At", "Teacher Override", "Teacher Note"],
    ...exam.answers.flatMap((answer) => {
      if (!answer.final) return [];
      const criterion = exam.pack?.questions.find((question) => question.id === answer.questionId);
      return [[exam.metadata.name, answer.student, answer.questionId, answer.final.marks, criterion?.maxMarks ?? "", answer.final.at, answer.final.override ? "yes" : "no", answer.final.note]];
    }),
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}
