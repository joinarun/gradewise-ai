import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowLeft, BookOpen, ChevronRight, ClipboardCheck, FileText, GraduationCap, LayoutDashboard, Plus, Settings2, ShieldCheck, Upload, Wifi, WifiOff } from "lucide-react";
import { createFirebaseInference } from "@gradewise/core";
import type { ExamMetadata } from "@gradewise/core";
import "@fontsource-variable/manrope";
import "@fontsource-variable/inter";
import { AnswersPanel } from "./answers";
import { useBatch } from "./batch";
import type { WebBatch } from "./batch";
import { Badge, Button, Empty, Notice, PageTitle } from "./components";
import { Dashboard, ExamTable } from "./dashboard";
import { dateLabel, examLabel } from "./model";
import type { ExamRecord, Settings } from "./model";
import { Insights, Preferences } from "./preferences";
import { Results, ReviewAnswer, ReviewQueue } from "./review";
import { sampleExam } from "./sample";
import { NewExam, RubricPanel, SourcesPanel, readableError } from "./setup";
import type { EditExam } from "./setup";
import { useWorkspace } from "./storage";
import "./styles.css";

const inference = createFirebaseInference();
const nav = [
  { label: "Overview", href: "#/", route: "overview", icon: LayoutDashboard },
  { label: "Examinations", href: "#/exams", route: "exams", icon: BookOpen },
  { label: "Review queue", href: "#/review", route: "review", icon: ClipboardCheck },
  { label: "Hybrid AI insights", href: "#/insights", route: "insights", icon: Activity },
  { label: "Settings", href: "#/settings", route: "settings", icon: Settings2 },
];

const steps = [
  { label: "Exam materials", path: "materials", icon: FileText },
  { label: "Grading rubric", path: "rubric", icon: ShieldCheck },
  { label: "Student answers", path: "answers", icon: Upload },
  { label: "Class results", path: "results", icon: ClipboardCheck },
];

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function ExamPage({ exam, tab, answerId, editExam, online, batch, settings }: {
  exam: ExamRecord; tab?: string; answerId?: string; editExam: EditExam; online: boolean; batch: WebBatch; settings: Settings;
}) {
  const destination = `#/exams/${exam.id}`;
  const go = (page: string) => { window.location.hash = `${destination}/${page}`; };
  const current = steps.some((step) => step.path === tab) ? tab : exam.pack?.approvedAt ? "answers" : exam.pack ? "rubric" : "materials";
  if (tab === "review") {
    const answer = exam.answers.find((answer) => answer.id === answerId);
    return answer ? <ReviewAnswer key={answer.id} exam={exam} answer={answer} editExam={editExam} /> :
      <section className="card"><Empty title="Answer unavailable" description="Choose an answer from this examination." action={<Button onClick={() => go("answers")}>Student answers</Button>} /></section>;
  }

  return <>
    <div className="page-title exam-heading"><div><a href="#/exams" className="back-link"><ArrowLeft size={16} /> All examinations</a>
      <h1>{exam.metadata.name}</h1><p>{exam.metadata.subject} · {exam.metadata.className} · {dateLabel(exam.metadata.date)} · {exam.metadata.maxMarks} marks</p></div>
      <div className="page-actions"><Badge tone={exam.pack?.approvedAt ? "success" : "default"}>{examLabel(exam)}</Badge>{exam.sample && <Badge tone="accent">Synthetic sample</Badge>}</div>
    </div>
    {exam.sample && <Notice>This sample has an approved rubric and synthetic student answers. Inference metrics appear after actual model responses.</Notice>}
    <nav className="workflow-nav" aria-label="Examination workflow">{steps.map(({ label, path, icon: Icon }) => (
      <a href={`${destination}/${path}`} aria-current={current === path ? "page" : undefined} className={current === path ? "active" : ""} key={path}><Icon size={18} /> {label}</a>
    ))}</nav>
    {current === "materials" && <SourcesPanel key={exam.id} exam={exam} inference={inference} online={online} editExam={editExam} onRubric={() => go("rubric")} />}
    {current === "rubric" && <RubricPanel key={exam.id} initialPack={exam.pack} editExam={editExam} onSources={() => go("materials")} onAnswers={() => go("answers")} />}
    {current === "answers" && <AnswersPanel key={exam.id} exam={exam} inference={inference} batch={batch} settings={settings} editExam={editExam} onRubric={() => go("rubric")} />}
    {current === "results" && <Results exam={exam} />}
  </>;
}

function App() {
  const { state, update, storageError } = useWorkspace();
  const batch = useBatch(inference, update);
  const [route, setRoute] = useState(currentRoute);
  const [online, setOnline] = useState(navigator.onLine);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const routeKey = route[0] || "overview";
  const navItem = nav.find((item) => item.route === routeKey) ?? nav[0];

  useEffect(() => {
    const location = () => { setRoute(currentRoute()); setError(""); window.scrollTo(0, 0); };
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", location);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    return () => {
      window.removeEventListener("hashchange", location);
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
    };
  }, []);

  useEffect(() => {
    document.title = `${navItem.label} · GradeWise AI`;
  }, [navItem.label]);

  async function createExam(metadata: ExamMetadata) {
    const id = crypto.randomUUID();
    await update((current) => ({
      ...current,
      exams: [{ id, metadata, paper: "", key: "", answers: [], createdAt: new Date().toISOString() }, ...current.exams],
    }));
    setCreating(false);
    window.location.hash = `#/exams/${id}/materials`;
  }

  async function loadSample() {
    const example = sampleExam();
    try {
      await update((current) => current.exams.some((exam) => exam.id === example.id) ? current : { ...current, exams: [example, ...current.exams] });
      window.location.hash = `#/exams/${example.id}/rubric`;
    } catch (failure) {
      setError(readableError(failure));
    }
  }

  const exam = routeKey === "exams" ? state?.exams.find((record) => record.id === route[1]) : undefined;
  const editExam: EditExam = async (change) => {
    if (!exam) throw new Error("Open an examination first.");
    await update((current) => ({ ...current, exams: current.exams.map((record) => record.id === exam.id ? change(record) : record) }));
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a href="#/" className="brand" aria-label="GradeWise AI home"><span className="brand-mark"><GraduationCap size={25} /></span><span>GradeWise<span> AI</span><small>TEACHER WORKSPACE</small></span></a>
      <nav className="side-nav" aria-label="Main navigation">{nav.map(({ label, href, route: itemRoute, icon: Icon }) =>
        <a key={itemRoute} href={href} aria-current={itemRoute === routeKey ? "page" : undefined}><Icon size={19} /><span>{label}</span></a>
      )}</nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><span><ShieldCheck size={17} /></span><div><strong>Local workspace</strong><small>Saved to this browser profile.</small></div></div>
      </div>
    </aside>
    <div className="app-body">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{navItem.label}</strong></div>
        <div className="topbar-actions">
          <span className={`connection ${online ? "" : "connection-offline"}`}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? "Online" : "Offline"}</span>
          <span className="topbar-divider" />
          <a href="#/settings" className="avatar" aria-label="Workspace settings">TW</a>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {(storageError || error) && <Notice tone="error">{storageError || error}</Notice>}
        {!state && !storageError && <p role="status" className="muted">Opening local workspace…</p>}
        {state && <>
          {routeKey === "overview" && <Dashboard workspace={state} createExam={() => setCreating(true)} loadSample={() => void loadSample()} />}
          {routeKey === "exams" && (exam ? <ExamPage exam={exam} tab={route[2]} answerId={route[3]} editExam={editExam} online={online} batch={batch} settings={state.settings} /> :
            <><PageTitle title="Examinations" description="Manage exam materials, grade student answers, and export class results."><Button variant="primary" onClick={() => setCreating(true)}><Plus size={17} /> New examination</Button></PageTitle>
              {route[1] && <Notice tone="error">This examination is unavailable in the current browser profile.</Notice>}
              <section className="card"><header className="card-header"><div><h2>All examinations</h2><p>{state.exams.length} saved on this device</p></div></header>
                <ExamTable exams={state.exams} createExam={() => setCreating(true)} loadSample={() => void loadSample()} /></section></>)}
          {routeKey === "review" && <ReviewQueue exams={state.exams} />}
          {routeKey === "insights" && <Insights workspace={state} />}
          {routeKey === "settings" && <Preferences settings={state.settings} inference={inference} online={online} save={async (settings) => { await update((current) => ({ ...current, settings })); }} />}
          {!nav.some((item) => item.route === routeKey) && <section className="card"><Empty icon={FileText} title="Page unavailable" description="Choose a workspace page to continue." action={<a href="#/" className="button button-primary">Return to overview</a>} /></section>}
        </>}
      </main>
    </div>
    {creating && <NewExam onClose={() => setCreating(false)} onCreate={createExam} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
