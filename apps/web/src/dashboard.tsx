import { ArrowDownRight, ArrowRight, BookOpen, Check, ClipboardCheck, Cloud, Cpu, FileText, Plus, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, Button, Empty, LinkArrow, PageTitle } from "./components";
import { workspaceInsights } from "./insights";
import { dateLabel, examLabel } from "./model";
import type { ExamRecord, Workspace } from "./model";

export function Stat({ label, value, detail, icon: Icon, tone = "violet" }: {
  label: string; value: string | number; detail?: string; icon: LucideIcon; tone?: "violet" | "green" | "blue" | "orange";
}) {
  return <div className="card stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={21} /></div>
    <div><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{detail && <div className="stat-detail">{detail}</div>}</div>
  </div>;
}

function Hero({ createExam, loadSample, hasSample }: { createExam: () => void; loadSample: () => void; hasSample: boolean }) {
  return <section className="hero" aria-label="Get started">
    <div className="hero-content">
      <span className="hero-pill"><Sparkles size={14} /> Local-first grading</span>
      <h2>Smarter grading.<br />More time for teaching.</h2>
      <p>Build a rubric once with Gemini, grade on your device when supported, and keep the final call in your hands.</p>
      <div className="hero-actions">
        <Button variant="white" onClick={createExam}><Plus size={17} /> New examination</Button>
        <Button variant="ghost" onClick={loadSample}>{hasSample ? "Open sample" : "Explore a sample"} <ArrowRight size={16} /></Button>
      </div>
    </div>
    <div className="hero-art" aria-hidden="true">
      <div className="hero-orbit orbit-one"></div><div className="hero-orbit orbit-two"></div><div className="hero-orbit orbit-three"></div>
      <div className="hero-sheet-back"></div>
      <div className="hero-sheet">
        <div className="hero-sheet-heading"><span><ClipboardCheck size={23} /></span><div>Grading pack<small>Teacher-approved rubric</small></div></div>
        <div className="hero-sheet-row"><Check size={16} /><i></i><em></em></div>
        <div className="hero-sheet-row"><Check size={16} /><i></i><em></em></div>
        <div className="hero-sheet-row"><Check size={16} /><i></i><em></em></div>
      </div>
      <div className="hero-chip hero-chip-cloud"><Cloud size={16} /> Cloud rubric</div>
      <div className="hero-chip hero-chip-device"><Cpu size={16} /> On-device grading</div>
      <Sparkles className="hero-starlight" size={27} /><Sparkles className="hero-small-star" size={15} />
    </div>
  </section>;
}

export function ExamTable({ exams, createExam, loadSample }: {
  exams: ExamRecord[]; createExam: () => void; loadSample: () => void;
}) {
  if (!exams.length) return <Empty title="No examinations yet" description="Create your first exam or explore the workflow with synthetic student answers." icon={BookOpen}
    action={<><Button onClick={loadSample}><Sparkles size={16} /> Open sample</Button><Button variant="primary" onClick={createExam}><Plus size={16} /> Create exam</Button></>} />;
  return <div className="table-wrap"><table>
    <thead><tr><th>Examination</th><th>Class</th><th>Date</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
    <tbody>{exams.map((exam) => {
      const status = examLabel(exam);
      return <tr key={exam.id}>
        <td><a className="exam-link" href={`#/exams/${exam.id}`}><span className="row-icon"><FileText size={19} /></span><span><strong>{exam.metadata.name}</strong><small>{exam.metadata.subject}{exam.sample ? " · Synthetic sample" : ""}</small></span></a></td>
        <td>{exam.metadata.className}</td><td>{dateLabel(exam.metadata.date)}</td>
        <td><Badge tone={status === "Finalized" || status === "Rubric approved" ? "success" : status === "In progress" ? "accent" : "default"}>{status}</Badge></td>
        <td><a className="icon-button" href={`#/exams/${exam.id}`} aria-label={`Open ${exam.metadata.name}`}><ArrowRight size={17} /></a></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export function InferenceMix({ device, cloud }: { device: number; cloud: number }) {
  const total = device + cloud;
  const percent = total ? device / total * 100 : 0;
  return <div className="mix">
    <div className="mix-label"><span className="mix-dot"></span><span>On-device</span><strong>{device}</strong></div>
    <div className="mix-label"><span className="mix-dot mix-dot-cloud"></span><span>Cloud</span><strong>{cloud}</strong></div>
    <div className="mix-bar" aria-label={`${device} on-device and ${cloud} cloud responses`} role="img">
      {total > 0 && <><div className="mix-device" style={{ width: `${percent}%` }}></div><div className="mix-cloud" style={{ width: `${100 - percent}%` }}></div></>}
    </div>
  </div>;
}

export function Dashboard({ workspace, createExam, loadSample }: {
  workspace: Workspace; createExam: () => void; loadSample: () => void;
}) {
  const stats = workspaceInsights(workspace.exams.filter((exam) => !exam.sample), workspace.settings);
  return <>
    <PageTitle title="Assessment overview" description="Create exams, review AI suggestions, and track finalized results." />
    <Hero createExam={createExam} loadSample={loadSample} hasSample={workspace.exams.some((exam) => exam.sample)} />
    <div className="stats-grid dashboard-stats">
      <Stat label="Examinations" value={stats.exams} detail="Teacher-created exams" icon={BookOpen} />
      <Stat label="Students evaluated" value={stats.students} detail={`${stats.answers} answers evaluated`} icon={Users} tone="blue" />
      <Stat label="Awaiting review" value={stats.needsReview} detail={`${stats.finalized} answers finalized`} icon={ClipboardCheck} tone="orange" />
      <Stat label="On-device responses" value={stats.device} detail="Verified by the inference SDK" icon={Zap} tone="green" />
    </div>
    <div className="dashboard-grid">
      <section className="card">
        <header className="card-header"><div><h2>Recent examinations</h2><p>Pick up where you left off.</p></div><LinkArrow href="#/exams">View all</LinkArrow></header>
        <ExamTable exams={workspace.exams.slice(0, 5)} createExam={createExam} loadSample={loadSample} />
      </section>
      <section className="card usage-card">
        <header className="card-header"><div><h2>Inference activity</h2><p>Source reported by Firebase AI Logic.</p></div><span className="stat-icon stat-violet"><Cpu size={20} /></span></header>
        <div className="usage-card-body">
          <InferenceMix device={stats.device} cloud={stats.cloud} />
          <div className="usage-callout"><ShieldCheck size={20} /><div><strong>{stats.avoidedCalls} answers evaluated locally without a cloud call</strong><span>Cloud API charges avoided are estimated in Insights.</span></div><ArrowDownRight size={16} /></div>
          <LinkArrow href="#/insights">View insights</LinkArrow>
        </div>
      </section>
    </div>
  </>;
}
