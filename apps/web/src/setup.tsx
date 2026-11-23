import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, Cloud, FileText, Plus, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { approvePack, generatePack, MAX_DOCUMENT_CHARS, validateExam } from "@gradewise/core";
import type { Attempt, ExamMetadata, GradingPack, Inference, QuestionRubric } from "@gradewise/core";
import { Badge, Button, Empty, Field, Loading, Modal, Notice } from "./components";
import { extractDocument, imageMime } from "./documents";
import type { ExamRecord } from "./model";

export type EditExam = (change: (record: ExamRecord) => ExamRecord) => Promise<void>;

export function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function NewExam({ onClose, onCreate }: { onClose: () => void; onCreate: (value: ExamMetadata) => Promise<void> }) {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  const [date] = useState(today.toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: String(form.get("name")).trim(),
      subject: String(form.get("subject")).trim(),
      className: String(form.get("className")).trim(),
      date: String(form.get("date")),
      maxMarks: Number(form.get("maxMarks")),
      autoApprove: form.get("autoApprove") === "yes",
    };
    setBusy(true);
    try {
      await onCreate(validateExam(values));
    } catch (failure) {
      setError(readableError(failure));
      setBusy(false);
    }
  }

  return <Modal title="Create examination" description="Set up the exam before adding the question paper and marking scheme." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Examination name"><input name="name" required maxLength={100} placeholder="e.g. Plant Biology Unit Assessment" autoFocus /></Field>
      <div className="field-grid">
        <Field label="Subject"><input name="subject" required maxLength={70} placeholder="e.g. Biology" /></Field>
        <Field label="Class"><input name="className" required maxLength={70} placeholder="e.g. Grade 7" /></Field>
        <Field label="Examination date"><input name="date" required type="date" defaultValue={date} /></Field>
        <Field label="Maximum marks" hint="Use increments of 0.5."><input name="maxMarks" required type="number" min="0.5" max="1000" step="0.5" placeholder="20" /></Field>
      </div>
      <label className="check-card"><input type="checkbox" name="autoApprove" value="yes" /><span><strong>Auto-approve validated AI grades</strong><small>Answers with warnings or unresolved evaluations still require teacher review.</small></span></label>
      <div className="modal-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={busy}>Create examination <ArrowRight size={17} /></Button></div>
    </form>
  </Modal>;
}

interface SourceDraft {
  value: string;
  name: string;
  needsVerification: boolean;
  verified: boolean;
  file?: File;
  emptyPages?: number[];
}

function sourceDraft(value: string): SourceDraft {
  return { value, name: "", needsVerification: false, verified: true };
}

function PreviewImage({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img className="source-preview" src={url} alt={`Uploaded document: ${file.name}`} /> : null;
}

function SourceEditor({ label, draft, onChange, inference, placeholder, disabled }: {
  label: string; draft: SourceDraft; onChange: (value: SourceDraft) => void; inference: Inference; placeholder: string; disabled: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const extracted = await extractDocument(file);
      onChange({
        value: extracted.text, file, name: file.name,
        needsVerification: extracted.images, verified: !extracted.images,
        emptyPages: extracted.emptyPages,
      });
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function recognizeImage() {
    if (!draft.file || !inference.extractImage) return;
    const mime = imageMime(draft.file);
    if (!mime) return;
    setBusy(true);
    setError("");
    try {
      await inference.initializeDevice();
      const text = await inference.extractImage(new Uint8Array(await draft.file.arrayBuffer()), mime);
      onChange({ ...draft, value: text, verified: false });
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setBusy(false);
    }
  }

  return <div className="source-editor">
    <Field label={label}>
      <textarea placeholder={placeholder} value={draft.value} maxLength={Math.max(MAX_DOCUMENT_CHARS, draft.value.length)} disabled={disabled || busy} onChange={(event) => onChange({ ...draft, value: event.target.value, verified: draft.needsVerification ? false : draft.verified })} rows={8} />
    </Field>
    {draft.value.length > MAX_DOCUMENT_CHARS && <Notice tone="error">Shorten this document to {MAX_DOCUMENT_CHARS.toLocaleString()} characters to generate a rubric.</Notice>}
    {!disabled && <label className="upload-control">
      <Upload size={17} /><span>{busy ? "Reading document…" : draft.name || "Upload file"}</span><small>TXT, PDF, PNG, JPG</small>
      <input type="file" accept=".txt,.pdf,.png,.jpg,.jpeg,text/plain,application/pdf,image/png,image/jpeg" aria-label={`Upload ${label.toLowerCase()}`} disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
    </label>}
    {error && <Notice tone="error">{error}</Notice>}
    {draft.needsVerification && <>
      <Notice>{draft.emptyPages?.length ? `No selectable text on PDF page(s) ${draft.emptyPages.join(", ")}. Transcribe those pages above.` : "Transcribe the image and verify the text before continuing."}</Notice>
      {draft.file && imageMime(draft.file) && <><PreviewImage file={draft.file} />{inference.extractImage &&
        <Button onClick={() => void recognizeImage()} disabled={busy}><Sparkles size={16} /> Extract on this device</Button>}</>}
      <label className="inline-check"><input type="checkbox" checked={draft.verified} onChange={(event) => onChange({ ...draft, verified: event.target.checked })} /> I verified the transcription against the original.</label>
    </>}
  </div>;
}

export function SourcesPanel({ exam, inference, online, editExam, onRubric }: {
  exam: ExamRecord; inference: Inference; online: boolean; editExam: EditExam; onRubric: () => void;
}) {
  const [paper, setPaper] = useState(() => sourceDraft(exam.paper));
  const [key, setKey] = useState(() => sourceDraft(exam.key));
  const [base, setBase] = useState({ paper: exam.paper, key: exam.key });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const approved = !!exam.pack?.approvedAt;
  const valid = Boolean(paper.value.trim() && key.value.trim() && paper.verified && key.verified);
  const withinLimits = paper.value.length <= MAX_DOCUMENT_CHARS && key.value.length <= MAX_DOCUMENT_CHARS;
  const changed = paper.value.trim() !== base.paper || key.value.trim() !== base.key;

  async function save() {
    setError("");
    try {
      const material = { paper: paper.value.trim(), key: key.value.trim() };
      await editExam((record) => {
        if (record.pack?.approvedAt) throw new Error("The source documents are fixed for an approved rubric.");
        if (record.paper !== base.paper || record.key !== base.key) throw new Error("The materials were updated in another tab. Reopen this examination to get the current text.");
        return { ...record, ...material, pack: changed ? undefined : record.pack };
      });
      setBase(material);
      setSaved(true);
    } catch (failure) {
      setError(readableError(failure));
    }
  }

  async function generate() {
    setError("");
    setBusy(true);
    let attempt: Attempt | undefined;
    async function requestPack() {
      const pack = await generatePack(inference, exam.metadata, paper.value.trim(), key.value.trim(), (observed) => { attempt = observed; });
      await editExam((record) => {
        if (record.pack?.approvedAt) throw new Error("An approved rubric already exists.");
        if (record.paper !== base.paper || record.key !== base.key) throw new Error("The materials changed while Gemini was generating the rubric. Reopen the examination to check the latest materials.");
        return { ...record, paper: paper.value.trim(), key: key.value.trim(), pack, rubricAttempts: attempt ? [...(record.rubricAttempts ?? []), attempt] : record.rubricAttempts };
      });
      onRubric();
    }
    try {
      if (navigator.locks) {
        await navigator.locks.request(`gradewise-ai-rubric-${exam.id}`, { ifAvailable: true }, async (lock) => {
          if (!lock) throw new Error("A rubric is already being generated for this exam in another tab.");
          await requestPack();
        });
      } else {
        await requestPack();
      }
    } catch (failure) {
      setError(readableError(failure));
      if (attempt) {
        const observed = attempt;
        try {
          await editExam((record) => ({ ...record, rubricAttempts: [...(record.rubricAttempts ?? []), observed] }));
        } catch (storageFailure) {
          setError(`${readableError(failure)} ${readableError(storageFailure)}`);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return <section className="card workflow-card">
    <header className="card-header"><div><h2>Question paper &amp; marking scheme</h2><p>Provide the exam materials that Gemini will use to prepare a grading rubric.</p></div><span className="stat-icon stat-violet"><FileText size={21} /></span></header>
    <div className="card-body form-stack">
      {approved && <Notice tone="success">The source material is saved with your approved rubric.</Notice>}
      {saved && <Notice tone="success">Exam materials saved on this device.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="field-grid source-grid">
        <SourceEditor label="Question paper" draft={paper} onChange={(value) => { setSaved(false); setPaper(value); }} inference={inference} disabled={approved || busy} placeholder="1. Mention two functions of roots in plants. (2 marks)" />
        <SourceEditor label="Answer key" draft={key} onChange={(value) => { setSaved(false); setKey(value); }} inference={inference} disabled={approved || busy} placeholder="1. Award 1 mark for absorption, and 1 mark for anchoring." />
      </div>
      {!approved && <>
      <Notice>{!inference.cloudConfigured ? "Cloud Firebase AI Logic is unavailable in this build. You can save materials or open the synthetic sample to review a rubric." : !online ? "You are offline. Save materials now and generate the rubric when connected." : "Generating a rubric sends the question paper and answer key to cloud Gemini. Use synthetic or non-sensitive materials and remove student information."}</Notice>
        <div className="panel-actions">
          <Button onClick={() => void save()} disabled={!valid || !changed || busy}>Save materials</Button>
        <Button variant="primary" onClick={() => void generate()} disabled={!valid || !withinLimits || !online || !inference.cloudConfigured || busy}>
            {busy ? <Loading label="Generating rubric…" /> : <><Cloud size={17} /> Generate grading rubric</>}
          </Button>
        </div>
      </>}
      {approved && <div className="panel-actions"><Button variant="primary" onClick={onRubric}>View approved rubric <ArrowRight size={17} /></Button></div>}
    </div>
  </section>;
}

function QuestionEditor({ question, index, locked, onChange, onDelete }: {
  question: QuestionRubric; index: number; locked: boolean; onChange: (value: QuestionRubric) => void; onDelete: () => void;
}) {
  function update<K extends keyof QuestionRubric>(field: K, value: QuestionRubric[K]) {
    onChange({ ...question, [field]: value });
  }
  function lines(value: string) {
    return value.split("\n");
  }

  return <details className="rubric-question" open={index === 0 || undefined}>
    <summary><span className="question-tag">{question.id || "New"}</span><strong>{question.text || "New rubric question"}</strong><Badge tone="accent">{question.maxMarks} {question.maxMarks === 1 ? "mark" : "marks"}</Badge></summary>
    <div className="rubric-editor form-stack">
      <div className="field-grid"><Field label="Question identifier"><input maxLength={70} value={question.id} disabled={locked} onChange={(event) => update("id", event.target.value)} /></Field>
        <Field label="Maximum marks"><input type="number" min="0.5" step="0.5" value={question.maxMarks} disabled={locked} onChange={(event) => update("maxMarks", event.target.valueAsNumber || 0)} /></Field></div>
      <Field label="Question text"><textarea rows={2} value={question.text} disabled={locked} onChange={(event) => update("text", event.target.value)} /></Field>
      <Field label="Reference answer"><textarea rows={3} value={question.referenceAnswer} disabled={locked} onChange={(event) => update("referenceAnswer", event.target.value)} /></Field>
      <div className="criteria-list"><h3>Marking criteria</h3>{question.criteria.map((criterion, criterionIndex) => <div className="criterion" key={criterionIndex}>
        <div className="field-grid"><Field label="Essential concept"><input value={criterion.description} disabled={locked} onChange={(event) => update("criteria", question.criteria.map((item, i) => i === criterionIndex ? { ...item, description: event.target.value } : item))} /></Field>
          <Field label="Criterion marks"><input type="number" min="0.5" step="0.5" value={criterion.maxMarks} disabled={locked} onChange={(event) => update("criteria", question.criteria.map((item, i) => i === criterionIndex ? { ...item, maxMarks: event.target.valueAsNumber || 0 } : item))} /></Field>
        </div>
        <Field label="Partial-credit rule"><textarea rows={2} value={criterion.partialCredit} disabled={locked} onChange={(event) => update("criteria", question.criteria.map((item, i) => i === criterionIndex ? { ...item, partialCredit: event.target.value } : item))} /></Field>
        {!locked && <Button variant="ghost" onClick={() => update("criteria", question.criteria.filter((_, i) => i !== criterionIndex))}><X size={15} /> Remove criterion</Button>}
      </div>)}
      {!locked && <Button onClick={() => update("criteria", [...question.criteria, { id: crypto.randomUUID(), description: "", maxMarks: 1, partialCredit: "" }])}><Plus size={16} /> Add criterion</Button>}
      </div>
      <details className="advanced-rubric"><summary>Alternative answers, examples and constraints</summary>
        <div className="field-grid">
          <Field label="Acceptable alternatives" hint="One per line"><textarea rows={3} value={question.alternatives.join("\n")} disabled={locked} onChange={(event) => update("alternatives", lines(event.target.value))} /></Field>
          <Field label="Scoring constraints" hint="One per line"><textarea rows={3} value={question.constraints.join("\n")} disabled={locked} onChange={(event) => update("constraints", lines(event.target.value))} /></Field>
          <Field label="Correct examples" hint="One per line"><textarea rows={3} value={question.examples.correct.join("\n")} disabled={locked} onChange={(event) => update("examples", { ...question.examples, correct: lines(event.target.value) })} /></Field>
          <Field label="Incorrect examples" hint="One per line"><textarea rows={3} value={question.examples.incorrect.join("\n")} disabled={locked} onChange={(event) => update("examples", { ...question.examples, incorrect: lines(event.target.value) })} /></Field>
        </div>
      </details>
      {!locked && <div><Button variant="danger" onClick={onDelete}>Remove question</Button></div>}
    </div>
  </details>;
}

export function RubricPanel({ initialPack, editExam, onSources, onAnswers }: {
  initialPack?: GradingPack; editExam: EditExam; onSources: () => void; onAnswers: () => void;
}) {
  const [pack, setPack] = useState(initialPack);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!pack) return <section className="card"><Empty title="No grading rubric yet" description="Add the question paper and answer key, then generate a draft rubric." icon={Sparkles} action={<Button variant="primary" onClick={onSources}>Open exam materials <ArrowRight size={16} /></Button>} /></section>;
  const locked = !!pack.approvedAt;
  const total = pack.questions.reduce((sum, question) => sum + question.maxMarks, 0);

  async function save(approve: boolean) {
    if (!pack) return;
    setBusy(true);
    setError("");
    try {
      const clean = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);
      const draft = { ...pack, questions: pack.questions.map((question) => ({
        ...question,
        id: question.id.trim(),
        text: question.text.trim(),
        referenceAnswer: question.referenceAnswer.trim(),
        alternatives: clean(question.alternatives),
        constraints: clean(question.constraints),
        examples: { correct: clean(question.examples.correct), incorrect: clean(question.examples.incorrect) },
      })) };
      const value = approve ? approvePack(draft) : draft;
      await editExam((record) => {
        if (record.pack?.approvedAt) throw new Error("The current rubric was already approved.");
        return { ...record, pack: value };
      });
      setPack(value);
      setSaved(true);
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      setBusy(false);
    }
  }

  function addQuestion() {
    if (!pack) return;
    let number = pack.questions.length + 1;
    while (pack.questions.some((question) => question.id.toLowerCase() === `q${number}`)) number++;
    setPack({ ...pack, questions: [...pack.questions, {
      id: `Q${number}`, text: "", referenceAnswer: "", maxMarks: 1,
      criteria: [{ id: `Q${number}-C1`, description: "", maxMarks: 1, partialCredit: "" }],
      alternatives: [], constraints: [], examples: { correct: [], incorrect: [] },
    }] });
    setSaved(false);
  }

  return <section className="card workflow-card">
    <header className="card-header"><div><h2>Grading intelligence pack</h2><p>{pack.questions.length} questions · {total} of {pack.exam.maxMarks} marks · Schema v{pack.schemaVersion}</p></div>
      <Badge tone={locked ? "success" : "warning"}>{locked ? <><Check size={14} /> Approved</> : "Draft"}</Badge></header>
    <div className="card-body form-stack">
      {!locked && <Notice>Check question numbers, maximum marks and partial-credit rules before approving the pack.</Notice>}
      {locked && <Notice tone="success"><strong>Approved rubric.</strong> It is stored on this device for grading offline when the local model is available.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {saved && !locked && <Notice tone="success">Draft saved on this device.</Notice>}
      {pack.questions.map((question, index) => <QuestionEditor key={index} question={question} index={index} locked={locked}
        onChange={(value) => { setSaved(false); setPack({ ...pack, questions: pack.questions.map((item, i) => i === index ? value : item) }); }}
        onDelete={() => { setSaved(false); setPack({ ...pack, questions: pack.questions.filter((_, i) => i !== index) }); }} />)}
      {!locked && <div><Button onClick={addQuestion}><Plus size={16} /> Add question</Button></div>}
      <div className="panel-actions">
        {locked ? <Button variant="primary" onClick={onAnswers}>Open student answers <ArrowRight size={16} /></Button> : <>
          <Button onClick={() => void save(false)} disabled={busy}>Save draft</Button>
          <Button variant="primary" onClick={() => void save(true)} disabled={busy || !pack.questions.length}><ShieldCheck size={16} /> Approve rubric</Button>
        </>}
      </div>
    </div>
  </section>;
}
