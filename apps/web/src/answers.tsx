import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, ClipboardCheck, Cloud, Cpu, FilePlus, FileText, Filter, Pause, Play, Plus, RefreshCw, Upload } from "lucide-react";
import { MAX_ANSWER_CHARS } from "@gradewise/core";
import type { Inference, QuestionRubric } from "@gradewise/core";
import { Badge, Button, Empty, Field, Modal, Notice, SelectField } from "./components";
import type { WebBatch } from "./batch";
import { extractDocument, imageMime, parsePaper } from "./documents";
import { answerLabel, policyLabels, uniqueAnswerKey } from "./model";
import type { AnswerRecord, ExamRecord, Settings } from "./model";
import { readableError } from "./setup";
import type { EditExam } from "./setup";

type AnswerInput = Pick<AnswerRecord, "student" | "questionId" | "text" | "extractionVerified">;
type UploadRecord = Omit<AnswerInput, "extractionVerified"> & { id: string; file: File; scan: boolean; verified: boolean; pages: number[] };

const accepted = ".txt,.pdf,.png,.jpg,.jpeg,text/plain,application/pdf,image/png,image/jpeg";

function QuestionOptions({ questions }: { questions: QuestionRubric[] }) {
  return <><option value="">Choose a question</option>{questions.map((question) => <option key={question.id} value={question.id}>{question.id} · {question.text}</option>)}</>;
}

function SingleAnswer({ questions, onSave, close }: { questions: QuestionRubric[]; onSave: (value: AnswerInput[]) => Promise<void>; close: () => void }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const student = String(values.get("student")).trim();
    const text = String(values.get("text")).trim();
    if (!student || !text) {
      setError("Enter a student identifier and answer.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave([{ student, questionId: String(values.get("question")), text, extractionVerified: true }]);
      close();
    } catch (failure) {
      setError(readableError(failure));
      setSaving(false);
    }
  }
  return <Modal title="Add a student answer" description="Assign the answer to a question in the approved rubric." onClose={close}>
    <form className="form-stack" onSubmit={submit}>
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Student identifier" hint="Use a pseudonym or student code."><input name="student" maxLength={80} placeholder="e.g. S-01" required autoFocus /></Field>
      <SelectField label="Question" name="question" required defaultValue={questions.length === 1 ? questions[0].id : ""}><QuestionOptions questions={questions} /></SelectField>
      <Field label="Student answer"><textarea rows={6} name="text" placeholder="Enter the answer as submitted." maxLength={MAX_ANSWER_CHARS} required /></Field>
      <div className="modal-actions"><Button onClick={close}>Cancel</Button><Button variant="primary" type="submit" disabled={saving}><Plus size={17} /> Add answer</Button></div>
    </form>
  </Modal>;
}

function UploadImage({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const imageUrl = URL.createObjectURL(file);
    setUrl(imageUrl);
    return () => URL.revokeObjectURL(imageUrl);
  }, [file]);
  return url ? <img src={url} className="source-preview" alt={`Uploaded answer from ${file.name}`} /> : null;
}

function ImportAnswers({ questions, onSave, close, inference }: {
  questions: QuestionRubric[]; onSave: (values: AnswerInput[]) => Promise<void>; close: () => void; inference: Inference;
}) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const questionIds = questions.map((question) => question.id);

  async function choose(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErrors([]);
    setConfirm(false);
    const loaded: UploadRecord[] = [];
    const notices: string[] = [];
    if (files.length > 25) {
      setErrors(["Upload up to 25 papers at a time."]);
      setBusy(false);
      return;
    }
    for (const file of files) {
      try {
        const parsed = await extractDocument(file);
        const student = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
        for (const row of parsePaper(parsed.text, questionIds)) {
          loaded.push({ ...row, student, id: crypto.randomUUID(), file, scan: parsed.images, verified: !parsed.images, pages: parsed.emptyPages });
        }
      } catch (failure) {
        notices.push(`${file.name}: ${readableError(failure)}`);
      }
    }
    setUploads((previous) => [...previous, ...loaded]);
    setErrors(notices);
    setBusy(false);
  }

  function edit(id: string, value: Partial<UploadRecord>) {
    setConfirm(false);
    setUploads((current) => current.map((record) => record.id === id ? { ...record, ...value } : record));
  }

  async function recognize(row: UploadRecord) {
    if (!inference.extractImage) return;
    const mime = imageMime(row.file);
    if (!mime) return;
    setBusy(true);
    setErrors([]);
    try {
      await inference.initializeDevice();
      const text = await inference.extractImage(new Uint8Array(await row.file.arrayBuffer()), mime);
      const parts = parsePaper(text, questionIds);
      setUploads((current) => current.flatMap((record) =>
        record.id === row.id ? parts.map((part) => ({ ...row, ...part, id: crypto.randomUUID(), verified: false })) : [record]));
      setConfirm(false);
    } catch (failure) {
      setErrors([readableError(failure)]);
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const inputs = uploads.map(({ student, questionId, text, verified }) => ({
        student: student.trim(), questionId, text: text.trim(), extractionVerified: verified,
      }));
      await onSave(inputs);
      close();
    } catch (failure) {
      setErrors([readableError(failure)]);
      setBusy(false);
    }
  }

  const complete = uploads.length > 0 && uploads.every((row) => !!row.student.trim() && !!row.questionId && !!row.text.trim() && row.text.length <= MAX_ANSWER_CHARS && row.verified);

  return <Modal title="Import student papers" description="Upload TXT, PDF, PNG or JPEG. Use one paper per student and identify answers with numbered headings." onClose={close}>
    <form className="form-stack" onSubmit={save}>
      <label className="upload-control"><Upload size={17} /><span>{busy ? "Working…" : "Choose answer files"}</span><small>Up to 25 files</small><input type="file" multiple accept={accepted} disabled={busy} aria-label="Choose answer files"
        onChange={(event) => { void choose(event.target.files); event.target.value = ""; }} /></label>
      {errors.map((error, index) => <Notice key={index} tone="error">{error}</Notice>)}
      {uploads.length > 0 && <div className="upload-preview-list">{uploads.map((row, index) => <details className="rubric-question" key={row.id} open={index === 0 || !row.questionId || row.scan || undefined}>
        <summary><FileText size={17} /><strong>{row.file.name}</strong><Badge tone={row.questionId && row.verified ? "default" : "warning"}>{row.questionId || "Needs matching"}</Badge></summary>
        <div className="rubric-editor form-stack">
          <div className="field-grid">
            <Field label="Student identifier"><input value={row.student} maxLength={80} onChange={(event) => edit(row.id, { student: event.target.value })} /></Field>
            <SelectField label="Question" value={row.questionId} onChange={(event) => edit(row.id, { questionId: event.target.value })}><QuestionOptions questions={questions} /></SelectField>
          </div>
          <Field label="Extracted answer"><textarea rows={4} value={row.text} maxLength={Math.max(row.text.length, MAX_ANSWER_CHARS)} onChange={(event) => edit(row.id, { text: event.target.value, verified: row.scan ? false : row.verified })} /></Field>
          {row.text.length > MAX_ANSWER_CHARS && <Notice tone="error">An answer can contain up to {MAX_ANSWER_CHARS.toLocaleString()} characters. Check its question split.</Notice>}
          {row.scan && <>
            <Notice>{row.pages.length ? `Transcribe missing PDF page(s) ${row.pages.join(", ")} from the original and verify the answer.` : "Transcribe the image and verify the answer against the original."}</Notice>
            {imageMime(row.file) && <><UploadImage file={row.file} />{inference.extractImage && <div><Button onClick={() => void recognize(row)} disabled={busy}>Extract on this device</Button></div>}</>}
            <label className="inline-check"><input type="checkbox" checked={row.verified} onChange={(event) => edit(row.id, { verified: event.target.checked })} /> I verified this transcription.</label>
          </>}
          <div className="page-actions">
            <Button variant="ghost" onClick={() => { setConfirm(false); setUploads((current) => current.filter((record) => record.id !== row.id)); }}>Remove answer</Button>
            {row.scan && <Button onClick={() => {
              setConfirm(false);
              setUploads((current) => [...current, { ...row, id: crypto.randomUUID(), questionId: "", text: "", verified: false }]);
            }}><Plus size={15} /> Add answer from this paper</Button>}
          </div>
        </div>
      </details>)}</div>}
      {uploads.length > 0 && <label className="inline-check"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> I checked the extracted answers and question matches.</label>}
      <div className="modal-actions"><Button onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || !complete || !confirm}><Check size={17} /> Import {uploads.length || ""} {uploads.length === 1 ? "answer" : "answers"}</Button></div>
    </form>
  </Modal>;
}

export function AnswerStatus({ answer }: { answer: AnswerRecord }) {
  const status = answerLabel(answer);
  return <Badge tone={answer.final ? "success" : status === "Ready for review" ? "accent" : ["Needs review", "Pending retry", "Rejected"].includes(status) ? "warning" : "default"}>{status}</Badge>;
}

export function AnswersPanel({ exam, inference, batch, settings, editExam, onRubric }: {
  exam: ExamRecord; inference: Inference; batch: WebBatch; settings: Settings; editExam: EditExam; onRubric: () => void;
}) {
  const [modal, setModal] = useState<"single" | "import">();
  const [pending, setPending] = useState<string[]>();
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const status = batch.view?.examId === exam.id ? batch.view : undefined;
  const saveCount = useRef(0);
  const active = !!batch.view?.active;

  if (!exam.pack?.approvedAt) return <section className="card"><Empty icon={ClipboardCheck} title="Approve a rubric before collecting answers" description="An approved rubric provides the question identifiers and mark limits for each answer." action={<Button variant="primary" onClick={onRubric}>Open grading rubric <ArrowRight size={17} /></Button>} /></section>;
  const questions = exam.pack.questions;

  async function addAnswers(inputs: AnswerInput[]) {
    saveCount.current = 0;
    await editExam((record) => {
      if (!record.pack?.approvedAt) throw new Error("Approve the rubric before importing answers.");
      const ids = new Set(record.pack.questions.map((question) => question.id));
      const seen = new Set(record.answers.map((answer) => uniqueAnswerKey(answer.student, answer.questionId)));
      const additions = inputs.flatMap((answer) => {
        if (!ids.has(answer.questionId) || !answer.student || !answer.text || !answer.extractionVerified) {
          throw new Error("Each answer needs a student identifier, approved question, and verified text.");
        }
        const key = uniqueAnswerKey(answer.student, answer.questionId);
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...answer, id: crypto.randomUUID() }];
      });
      saveCount.current = additions.length;
      return { ...record, answers: [...record.answers, ...additions] };
    });
    setMessage(`${saveCount.current} answer(s) added.${saveCount.current < inputs.length ? ` ${inputs.length - saveCount.current} duplicate student and question pair(s) skipped.` : ""}`);
  }

  function runAnswers(ids: string[]) {
    if (!ids.length) return;
    if (settings.policy === "device-only" || !inference.cloudConfigured) {
      void batch.run(exam, ids, settings.policy, false);
    } else {
      setPending(ids);
      setConsent(false);
    }
  }

  const queued = exam.answers.filter((answer) => !answer.final && !answer.rejected && !answer.evaluation);
  const retry = exam.answers.filter((answer) => !answer.final && !answer.rejected && answer.evaluation && answer.evaluation.status !== "provisional");
  const filtered = exam.answers.filter((answer) => {
    if (filter === "review") return !answer.final && !answer.rejected && !!answer.evaluation;
    if (filter === "queued") return !answer.final && !answer.rejected && !answer.evaluation;
    if (filter === "finalized") return !!answer.final;
    return true;
  });

  return <section className="card workflow-card">
    <header className="card-header"><div><h2>Student answers</h2><p>{exam.answers.length} submitted · {queued.length} queued · {retry.length} flagged</p></div>
      <div className="page-actions"><Button onClick={() => { setMessage(""); setModal("import"); }}><Upload size={17} /> Import papers</Button><Button variant="primary" onClick={() => { setMessage(""); setModal("single"); }}><Plus size={17} /> Add answer</Button></div></header>
    <div className="card-body form-stack">
      {message && <Notice tone="success">{message}</Notice>}
      <div className="batch-toolbar">
        <span className="stat-icon stat-violet"><Cpu size={21} /></span>
        <div><strong>Batch evaluation</strong><small>{policyLabels[settings.policy]} · <a href="#/settings">Inference settings</a></small></div>
        <div className="page-actions">
          {status?.active ? <Button onClick={batch.pause} disabled={status.paused}><Pause size={17} /> Pause batch</Button> : <>
            {retry.length > 0 && <Button onClick={() => runAnswers(retry.map((answer) => answer.id))} disabled={active}><RefreshCw size={16} /> Retry flagged</Button>}
            <Button variant="primary" onClick={() => runAnswers(queued.map((answer) => answer.id))} disabled={active || !queued.length}><Play size={16} /> {status?.paused ? "Resume batch" : "Grade queued answers"}</Button>
          </>}
        </div>
      </div>
      {status && <div className="batch-state" role="status">
        <div><span>{status.message}</span><strong>{status.completed} / {status.total}</strong></div>
        <progress max={status.total} value={status.completed} aria-label="Batch evaluation progress" />
        {status.active && status.progress !== null && status.progress < 1 && <small>Preparing on-device model · {Math.round(status.progress * 100)}%</small>}
      </div>}
    </div>
    {!exam.answers.length ? <Empty icon={FilePlus} title="No answers added" description="Upload student papers or type an answer to start grading." action={<Button onClick={() => setModal("import")}><Upload size={17} /> Import papers</Button>} /> : <>
      <div className="table-toolbar"><Filter size={16} /><SelectField label="Filter answers" value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="all">All answers</option><option value="queued">Queued</option><option value="review">Awaiting review</option><option value="finalized">Finalized</option>
      </SelectField></div>
      {filtered.length === 0 ? <Empty title="No matching answers" description="Select a different filter to see other answers." /> : <div className="table-wrap"><table>
        <thead><tr><th>Student</th><th>Question &amp; answer</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{filtered.map((answer) => <tr key={answer.id}>
          <td><strong>{answer.student}</strong></td>
          <td><div className="answer-excerpt"><strong>{answer.questionId}</strong><span>{answer.text}</span></div></td>
          <td><AnswerStatus answer={answer} /></td>
          <td><div className="row-actions">
            {!answer.final && !answer.rejected && answer.evaluation?.status !== "provisional" && <Button variant="ghost" disabled={active} onClick={() => runAnswers([answer.id])} aria-label={`Grade ${answer.student} ${answer.questionId}`}><Play size={15} /> Grade</Button>}
            <a className="button button-secondary compact" href={`#/exams/${exam.id}/review/${answer.id}`}>Review <ArrowRight size={15} /></a>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </>}
    {modal === "single" && <SingleAnswer questions={questions} close={() => setModal(undefined)} onSave={addAnswers} />}
    {modal === "import" && <ImportAnswers questions={questions} inference={inference} close={() => setModal(undefined)} onSave={addAnswers} />}
    {pending && <Modal title="Permission for cloud evaluation" description={`The selected policy is ${policyLabels[settings.policy]}. A cloud request can include an answer, its question and the approved rubric.`} onClose={() => setPending(undefined)}>
      <div className="form-stack">
        <Notice><strong>Use synthetic or non-sensitive text only.</strong> The Gemini Developer API can process the content outside this device. Remove identifiers from answer text before authorizing a cloud request.</Notice>
        <label className="check-card"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>I permit cloud processing for this run</strong><small>This permission applies to the {pending.length} selected answer(s) for this run only.</small></span></label>
        <div className="modal-actions"><Button onClick={() => { const ids = pending; setPending(undefined); void batch.run(exam, ids, settings.policy, false); }}>Continue without cloud</Button>
          <Button variant="primary" disabled={!consent} onClick={() => { const ids = pending; setPending(undefined); void batch.run(exam, ids, settings.policy, true); }}><Cloud size={17} /> Start evaluation</Button></div>
      </div>
    </Modal>}
  </section>;
}
