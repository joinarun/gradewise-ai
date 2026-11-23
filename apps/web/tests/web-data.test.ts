import assert from "node:assert/strict";
import test from "node:test";
import { parsePaper } from "../src/documents.ts";
import { classResults, finalizedCsv, workspaceInsights } from "../src/insights.ts";
import { defaultWorkspace } from "../src/model.ts";
import { sampleExam } from "../src/sample.ts";

test("matches question labels and keeps unrecognized numbered content for teacher mapping", () => {
  assert.deepEqual(parsePaper("Question 1(a): First answer\nContinued\nQ9: Unknown part\n2. Second answer", ["Q1(a)", "Q2"]), [
    { questionId: "Q1(a)", text: "First answer\nContinued" },
    { questionId: "", text: "Unknown part" },
    { questionId: "Q2", text: "Second answer" },
  ]);
});

test("CSV escapes formulas, and class totals exclude unfinalized scores", () => {
  const exam = sampleExam();
  exam.answers[0].student = "=HYPERLINK(\"https://example.invalid\")";
  exam.answers[0].final = { marks: 1.5, override: true, at: "2026-11-23T12:00:00.000Z", note: "  +cmd" };
  assert.match(finalizedCsv(exam), /"'=HYPERLINK\(""https:\/\/example.invalid""\)"/);
  assert.match(finalizedCsv(exam), /"'  \+cmd"/);
  assert.doesNotMatch(finalizedCsv(exam), /"Q2"/);
  assert.equal(classResults(exam).find((row) => row.student.startsWith("="))?.marks, 1.5);
});

test("analytics report SDK sources and include rubric usage in cost estimates", () => {
  const exam = sampleExam();
  const result = { marks: 2, explanation: "Both conditions are present.", criteria: [], uncertain: false };
  exam.rubricAttempts = [{ source: "cloud", latencyMs: 20, promptChars: 20, usage: { inputTokens: 5, outputTokens: 10 } }];
  exam.answers[0].evaluation = { status: "provisional", warnings: [], proposed: result,
    attempts: [{ source: "device", latencyMs: 10, promptChars: 20, result }] };
  exam.answers[1].evaluation = { status: "review", warnings: ["Review"],
    attempts: [{ source: "unknown", requestedSource: "device", latencyMs: 10, promptChars: 20, error: "Unavailable" },
      { source: "cloud", latencyMs: 20, promptChars: 20, responseChars: 4, error: "Invalid grade" }] };
  const data = workspaceInsights([exam], defaultWorkspace.settings);
  assert.deepEqual([data.device, data.cloud, data.unknown, data.cloudRubricRequests, data.cloudInput, data.cloudOutput], [1, 2, 1, 1, 10, 11]);
  assert.deepEqual([data.failures, data.estimatedCloudCost, data.avoidedCalls, data.agreement], [2, 0.0000305, 1, 1]);
  assert.deepEqual([data.escalated, data.escalationBase], [1, 2]);
});
