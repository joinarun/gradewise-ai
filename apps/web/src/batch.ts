import { useRef, useState } from "react";
import { evaluateAnswer } from "@gradewise/core";
import type { Evaluation, Inference, Policy } from "@gradewise/core";
import { finalizeAnswer } from "./model";
import type { AnswerRecord, ExamRecord } from "./model";
import type { ChangeWorkspace } from "./storage";

export interface BatchView {
  examId: string;
  completed: number;
  total: number;
  paused: boolean;
  active: boolean;
  message: string;
  progress: number | null;
}

const leaseTime = 15 * 60 * 1_000;

export function useBatch(inference: Inference, update: (change: ChangeWorkspace) => Promise<unknown>) {
  const [view, setView] = useState<BatchView>();
  const currentRun = useRef<{ paused: boolean } | null>(null);

  function pause() {
    if (currentRun.current) currentRun.current.paused = true;
    setView((current) => current ? { ...current, paused: true, message: "Pausing after the current answer…" } : current);
  }

  async function run(exam: ExamRecord, ids: string[], policy: Policy, cloudConsent: boolean) {
    if (currentRun.current || !exam.pack?.approvedAt || !ids.length) return;
    const approvedAt = exam.pack.approvedAt;
    const operation = { paused: false };
    currentRun.current = operation;
    setView({ examId: exam.id, completed: 0, total: ids.length, active: true, paused: false, progress: null, message: "Preparing evaluation…" });
    const initialization = policy === "cloud-only" ? undefined :
      inference.initializeDevice((progress) => {
        if (currentRun.current === operation) setView((current) => current ? { ...current, progress } : current);
      }).catch(() => undefined);

    let completed = 0;
    let outcome = "";
    async function runQueue(exclusive: boolean) {
      if (policy !== "cloud-first" || !cloudConsent || !navigator.onLine) await initialization;
      if (exclusive) await update((state) => ({
        ...state,
        exams: state.exams.map((record) => record.id !== exam.id ? record : {
          ...record, answers: record.answers.map(({ runningAt: _runningAt, ...answer }) => answer),
        }),
      }));
      for (const id of ids) {
        if (operation.paused) break;
        const now = Date.now();
        let claim: AnswerRecord | undefined;
        await update((state) => ({
          ...state,
          exams: state.exams.map((record) => {
            if (record.id !== exam.id || record.pack?.approvedAt !== approvedAt) return record;
            return { ...record, answers: record.answers.map((answer) => {
              if (answer.id !== id || answer.final || (answer.runningAt && now - answer.runningAt < leaseTime)) return answer;
              claim = { ...answer, runningAt: now };
              return claim;
            }) };
          }),
        }));
        const answer = claim;
        const rubric = exam.pack?.questions.find((question) => question.id === answer?.questionId);
        if (answer) {
          setView((current) => current ? { ...current, message: `Evaluating ${answer.student} · ${answer.questionId}` } : current);
          let evaluation: Evaluation;
          try {
            evaluation = rubric ? await evaluateAnswer(inference, rubric, answer.text, {
              policy, cloudConsent, online: navigator.onLine, extractionVerified: answer.extractionVerified,
            }) : { status: "review", attempts: [], warnings: ["The answer could not be matched to an approved question."] };
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : "The model request failed.";
            evaluation = { status: "pending", attempts: [], warnings: [message] };
          }

          await update((state) => ({
            ...state,
            exams: state.exams.map((record) => record.id !== exam.id ? record : {
              ...record,
              answers: record.answers.map((stored) => {
                if (stored.id !== id || stored.runningAt !== now) return stored;
                const next = {
                  ...stored,
                  runningAt: undefined,
                  rejected: false,
                  evaluation: { ...evaluation, attempts: [...(stored.evaluation?.attempts ?? []), ...evaluation.attempts] },
                };
                if (record.metadata.autoApprove && evaluation.status === "provisional" && evaluation.proposed && !evaluation.warnings.length && !next.final) {
                  return finalizeAnswer(next, evaluation.proposed.marks, "Auto-approved under the examination preference.", false);
                }
                return next;
              }),
            }),
          }));
        }
        completed++;
        setView((current) => current ? { ...current, completed } : current);
      }
    }
    try {
      if (navigator.locks) {
        await navigator.locks.request(`gradewise-ai-batch-${exam.id}`, { ifAvailable: true }, async (lock) => {
          if (lock) await runQueue(true);
          else outcome = "An evaluation is running for this examination in another tab.";
        });
      } else {
        await runQueue(false);
      }
    } catch (failure) {
      outcome = failure instanceof Error ? failure.message : "The batch could not be saved. Retry from the remaining answers.";
    } finally {
      currentRun.current = null;
      setView((current) => current ? {
        ...current, completed, progress: null, active: false, paused: operation.paused,
        message: outcome || (operation.paused ? "Batch paused. Resume when you’re ready." : `Batch complete. ${completed} of ${ids.length} queued answers checked.`),
      } : current);
    }
  }
  return { view, run, pause };
}

export type WebBatch = ReturnType<typeof useBatch>;
