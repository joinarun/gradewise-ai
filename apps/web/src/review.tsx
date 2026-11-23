import { useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ClipboardCheck, Cloud, Cpu, FileCheck, FileDown, FileText, PenLine, X } from "lucide-react";
import type { Attempt, GradingResult } from "@gradewise/core";
import { AnswerStatus } from "./answers";
import { Badge, Button, Empty, Field, Notice, PageTitle } from "./components";
import { classResults, finalizedCsv } from "./insights";
import { finalizeAnswer } from "./model";
import type { AnswerRecord, ExamRecord } from "./model";
import { readableError } from "./setup";
import type { EditExam } from "./setup";

function SourceBadge({ source }: { source: Attempt["source"] }) {
  const Icon = source === "device" ? Cpu : source === "cloud" ? Cloud : AlertTriangle;
  return <Badge tone={source === "device" ? "success" : source === "cloud" ? "accent" : "warning"}><Icon size={14} /> {source === "device" ? "On-device" : source === "cloud" ? "Cloud" : "Source unavailable"}</Badge>;
}

function ScoreEvidence({ result }: { result: GradingResult }) {
  return <><p className="answer-text">{result.explanation}</p>
    {result.criteria.length > 0 && <ul className="evidence-list">{result.criteria.map((criterion, index) => <li key={`${criterion.criterionId}-${index}`}>
      <span className="question-tag">{criterion.criterionId}</span><strong>{criterion.marks} mark(s)</strong>
      <span>{criterion.evidence || "No evidence cited"}</span>
    </li>)}</ul>}
  </>;
}

export function ReviewAnswer({ exam, answer, editExam }: { exam: ExamRecord; answer: AnswerRecord; editExam: EditExam }) {
  const rubric = exam.pack?.questions.find((question) => question.id === answer.questionId);
  const suggested = answer.evaluation?.proposed;
  const [marks, setMarks] = useState(String(answer.final?.marks ?? suggested?.marks ?? ""));
  const [note, setNote] = useState(answer.final?.note ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  async function record(kind: "approve" | "override" | "reject") {
    const value = kind === "approve" ? suggested?.marks : marks.trim() ? Number(marks) : undefined;
    if (kind !== "reject" && (value === undefined || !Number.isInteger(value * 2) || value < 0 || !rubric || value > rubric.maxMarks)) {
      setError(`Enter a score between 0 and ${rubric?.maxMarks ?? 0} in increments of 0.5.`);
      return;
    }
    setSaving(true);
    setSaved("");
    setError("");
    try {
      await editExam((current) => ({
        ...current,
        answers: current.answers.map((item) => {
          if (item.id !== answer.id) return item;
          if (item.runningAt) throw new Error("Wait for the current inference attempt before recording a final grade.");
          if (kind === "reject") return { ...item, final: undefined, rejected: true };
          if (kind === "approve" && (item.evaluation?.status !== "provisional" || item.evaluation.proposed?.marks !== value)) {
            throw new Error("The proposed score was updated. Review the new result before approving it.");
          }
          const original = item.evaluation?.proposed?.marks;
          return finalizeAnswer(item, value as number, note.trim(), original !== undefined && original !== value);
        }),
      }));
      setSaved(kind === "reject" ? "The proposed grade is rejected." : "Final score saved.");
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setSaving(false);
    }
  }

  function override(event: FormEvent) {
    event.preventDefault();
    void record("override");
  }

  if (!rubric) return <section className="card"><Empty title="Question rubric unavailable" description="The answer requires review against an approved question." /></section>;

  return <>
    <div className="page-title"><div><a href={`#/exams/${exam.id}/answers`} className="back-link"><ArrowLeft size={16} /> Back to student answers</a>
      <h1>{answer.student} · {answer.questionId}</h1><p>{exam.metadata.name} · {rubric.maxMarks} possible marks</p></div><AnswerStatus answer={answer} /></div>
    <div className="review-grid">
      <section className="card review-card">
        <header className="card-header"><div><h2>Answer &amp; approved rubric</h2><p>Use the exact submitted response and marking criteria.</p></div><span className="stat-icon stat-violet"><FileText size={20} /></span></header>
        <div className="card-body form-stack">
          <div className="review-content"><h3>Original question</h3><p>{rubric.text}</p></div>
          <div className="review-content answer-original"><h3>Student answer</h3><p className="answer-text">{answer.text}</p></div>
          {!answer.extractionVerified && <Notice tone="error">The source transcription remains unverified. Check the original before assigning a score.</Notice>}
          <div className="review-content"><h3>Reference answer</h3><p>{rubric.referenceAnswer}</p></div>
          <div className="criteria-list"><h3>Marking criteria</h3>
            {rubric.criteria.map((criterion) => <div className="criterion" key={criterion.id}><div className="criterion-heading"><strong>{criterion.description}</strong><Badge>{criterion.maxMarks} {criterion.maxMarks === 1 ? "mark" : "marks"}</Badge></div><p>{criterion.partialCredit}</p></div>)}
          </div>
          {rubric.alternatives.length > 0 && <div className="review-content"><h3>Acceptable alternatives</h3><ul className="warning-list">{rubric.alternatives.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
          {rubric.constraints.length > 0 && <div className="review-content"><h3>Scoring constraints</h3><ul className="warning-list">{rubric.constraints.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
        </div>
      </section>
      <div className="column">
        <section className="card review-card">
          <header className="card-header"><div><h2>AI evaluation</h2><p>{suggested ? `Proposed score ${suggested.marks} / ${rubric.maxMarks}` : "No provisional score available"}</p></div><span className="stat-icon stat-violet"><Cpu size={21} /></span></header>
          <div className="card-body form-stack">
            {Boolean(answer.evaluation?.warnings.length) && <Notice><ul className="warning-list">{answer.evaluation?.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Notice>}
            {suggested && <ScoreEvidence result={suggested} />}
            {Boolean(answer.evaluation?.attempts.length) && <div className="attempt-list"><h3>Inference attempts</h3>{answer.evaluation?.attempts.map((attempt, index) => <details key={index} className="rubric-question">
              <summary><strong>Attempt {index + 1}</strong><SourceBadge source={attempt.source} /><span>{Math.round(attempt.latencyMs)} ms</span></summary>
              <div className="rubric-editor form-stack">
                {attempt.error && <Notice tone="error">{attempt.error}</Notice>}
                {attempt.requestedSource && attempt.source === "unknown" && <small>Requested path: {attempt.requestedSource === "device" ? "On-device" : "Cloud"}</small>}
                {attempt.result && <><strong>{attempt.result.marks} / {rubric.maxMarks} marks</strong><ScoreEvidence result={attempt.result} /></>}
                {attempt.usage && <small>{attempt.usage.inputTokens} input tokens · {attempt.usage.outputTokens} output tokens</small>}
              </div>
            </details>)}</div>}
            {answer.reference !== undefined && <Notice><strong>Synthetic benchmark</strong> · Teacher reference {answer.reference} / {rubric.maxMarks}</Notice>}
          </div>
        </section>
        <section className="card review-card">
          <header className="card-header"><div><h2>Teacher decision</h2><p>{answer.final ? `Final score ${answer.final.marks} / ${rubric.maxMarks}` : "Record a final score when you’re ready."}</p></div><span className="stat-icon stat-green"><ClipboardCheck size={22} /></span></header>
          <form className="card-body form-stack" onSubmit={override}>
            {error && <Notice tone="error">{error}</Notice>}{saved && <Notice tone="success">{saved}</Notice>}
            {!answer.final && answer.evaluation?.status === "provisional" && suggested &&
              <Button variant="primary" disabled={saving || !!answer.runningAt} onClick={() => void record("approve")}><Check size={17} /> Approve {suggested.marks} / {rubric.maxMarks}</Button>}
            <Field label="Final marks"><input type="number" min="0" max={rubric.maxMarks} step="0.5" value={marks} onChange={(event) => setMarks(event.target.value)} /></Field>
            <Field label="Teacher note" hint="Optional"><textarea rows={3} value={note} maxLength={2_000} onChange={(event) => setNote(event.target.value)} /></Field>
            <div className="panel-actions">
              {answer.evaluation?.proposed && !answer.final && !answer.rejected && <Button variant="danger" onClick={() => void record("reject")} disabled={saving || !!answer.runningAt}><X size={16} /> Reject suggestion</Button>}
              <Button type="submit" variant={suggested && !answer.final ? "secondary" : "primary"} disabled={saving || !!answer.runningAt || !marks.trim()}><PenLine size={16} /> {suggested ? "Save override" : answer.final ? "Update marks" : "Finalize marks"}</Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  </>;
}

export function ReviewQueue({ exams }: { exams: ExamRecord[] }) {
  const queue = exams.flatMap((exam) => exam.answers
    .filter((answer) => !answer.final && !answer.rejected && !!answer.evaluation)
    .map((answer) => ({ exam, answer })));
  return <>
    <PageTitle title="Review queue" description="Check provisional grades and resolve answers that need a teacher’s decision." />
    <section className="card"><header className="card-header"><div><h2>Awaiting review</h2><p>{queue.length} answer(s) in the queue</p></div><span className="stat-icon stat-orange"><ClipboardCheck size={20} /></span></header>
      {queue.length === 0 ? <Empty icon={ClipboardCheck} title="You’re all caught up" description="Provisional and flagged grades appear here after an evaluation." action={<a className="button button-secondary" href="#/exams">Open examinations <ArrowRight size={16} /></a>} /> :
        <div className="table-wrap"><table><thead><tr><th>Examination</th><th>Student</th><th>Question</th><th>Status</th><th><span className="sr-only">Open answer</span></th></tr></thead>
          <tbody>{queue.map(({ exam, answer }) => <tr key={answer.id}><td><strong>{exam.metadata.name}</strong>{exam.sample && <small className="block">Synthetic sample</small>}</td>
            <td>{answer.student}</td><td>{answer.questionId}</td><td><AnswerStatus answer={answer} /></td>
            <td><a className="button button-secondary compact" href={`#/exams/${exam.id}/review/${answer.id}`}>Review <ArrowRight size={16} /></a></td></tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}

export function Results({ exam }: { exam: ExamRecord }) {
  const rows = classResults(exam);
  const finalized = rows.reduce((sum, row) => sum + row.finalized, 0);

  function download() {
    const file = new Blob([finalizedCsv(exam)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exam.metadata.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "examination"}-results.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="card workflow-card">
    <header className="card-header"><div><h2>Class results</h2><p>{finalized} finalized answer(s) across {rows.length} student(s)</p></div>
      <Button variant="primary" disabled={!finalized} onClick={download}><FileDown size={17} /> Export finalized CSV</Button></header>
    {!rows.length ? <Empty title="No student results yet" description="Scores appear here as you finalize student answers." icon={FileCheck} /> :
      <div className="table-wrap"><table><thead><tr><th>Student</th><th>Finalized answers</th><th>Total marks</th><th>Status</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.student}>
          <td><strong>{row.student}</strong></td><td>{row.finalized} / {exam.pack?.questions.length ?? row.submitted}</td>
          <td>{row.finalized ? `${Number(row.marks.toFixed(2))} / ${exam.metadata.maxMarks}` : "—"}</td>
          <td><Badge tone={row.finalized === exam.pack?.questions.length ? "success" : "default"}>{row.finalized === exam.pack?.questions.length ? "Complete" : "In progress"}</Badge></td>
        </tr>)}</tbody></table></div>}
  </section>;
}
