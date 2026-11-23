import { useEffect, useState } from "react";
import { Activity, Check, ClipboardCheck, Cloud, Cpu, DollarSign, Fingerprint, FlaskConical, Gauge, Router, ShieldCheck, Timer, TriangleAlert, Zap } from "lucide-react";
import { DEFAULT_CLOUD_MODEL } from "@gradewise/core";
import type { Inference, Policy } from "@gradewise/core";
import { Badge, Button, Field, Notice, PageTitle, SelectField } from "./components";
import { InferenceMix, Stat } from "./dashboard";
import { workspaceInsights } from "./insights";
import { policyLabels } from "./model";
import type { Workspace, Settings } from "./model";
import { readableError } from "./setup";

function percentage(numerator: number, denominator: number) {
  return denominator ? `${Math.round(numerator / denominator * 1000) / 10}%` : "—";
}

function dollars(value: number | null) {
  if (value === null) return "—";
  if (value > 0 && value < 0.000001) return "< $0.000001";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
}

export function Insights({ workspace }: { workspace: Workspace }) {
  const [scope, setScope] = useState("workspace");
  const exams = workspace.exams.filter((exam) => scope === "sample" ? exam.sample : !exam.sample);
  const data = workspaceInsights(exams, workspace.settings);
  return <>
    <PageTitle title="Hybrid AI insights" description="See how your grading workload is split across device and cloud.">
      <SelectField label="Data scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="workspace">Teacher workspace</option><option value="sample" disabled={!workspace.exams.some((exam) => exam.sample)}>Synthetic sample only</option></SelectField>
    </PageTitle>
    <div className="stats-grid">
      <Stat label="Answers evaluated" value={data.answers} detail={`${data.students} students · ${data.questions} questions`} icon={ClipboardCheck} />
      <Stat label="Cloud escalation rate" value={percentage(data.escalated, data.escalationBase)} detail={`${data.escalated} of ${data.escalationBase} answers attempted on device`} icon={Cloud} tone="blue" />
      <Stat label="Average attempt latency" value={data.latencyMs === null ? "—" : `${Math.round(data.latencyMs)} ms`} detail="Device, cloud and failed attempts" icon={Timer} tone="green" />
      <Stat label="Model failures" value={data.failures} detail={`${data.unknown} attempts with unreported source`} icon={TriangleAlert} tone="orange" />
    </div>
    <div className="dashboard-grid equal-grid">
      <section className="card usage-card">
        <header className="card-header"><div><h2>Device and cloud usage</h2><p>Source reported by the inference SDK.</p></div><span className="stat-icon stat-violet"><Cpu size={21} /></span></header>
        <div className="usage-card-body">
          <InferenceMix device={data.device} cloud={data.cloud} />
          <dl className="value-list"><div><dt>Cloud rubric responses</dt><dd>{data.cloudRubricRequests}</dd></div><div><dt>Cloud input tokens</dt><dd>{data.cloudInput}</dd></div><div><dt>Cloud output tokens</dt><dd>{data.cloudOutput}</dd></div><div><dt>Responses using estimated tokens</dt><dd>{data.estimatedCloudResponses}</dd></div></dl>
        </div>
      </section>
      <section className="card usage-card">
        <header className="card-header"><div><h2>Estimated cloud charges</h2><p>Paid-rate comparison using observations and configured token rates.</p></div><span className="stat-icon stat-green"><DollarSign size={21} /></span></header>
        <div className="usage-card-body">
          <dl className="value-list"><div><dt>Cloud API charges</dt><dd>{dollars(data.estimatedCloudCost)}</dd></div><div><dt>Cloud API charges avoided</dt><dd>{dollars(data.estimatedCloudAvoided)}</dd></div><div><dt>Answers graded locally without cloud</dt><dd>{data.avoidedCalls}</dd></div></dl>
          {data.estimatedCloudCost === null && <Notice><a href="#/settings">Configure token pricing</a> to view cost estimates.</Notice>}
          <p className="muted">The demo’s Firebase Spark tier incurs zero API charges within quota. Missing token data and avoided charges use four characters per token. Estimates exclude device compute and taxes.</p>
        </div>
      </section>
    </div>
    <div className="stats-grid insight-secondary">
      <Stat label="Teacher override rate" value={percentage(data.overrides, data.overrideBase)} detail={`${data.overrides} overrides across ${data.overrideBase} finalized AI suggestions`} icon={Fingerprint} />
      <Stat label="Exact score agreement" value={percentage(data.agreement, data.benchmark)} detail={`${data.agreement} exact matches across ${data.benchmark} scored benchmark answers`} icon={FlaskConical} tone="blue" />
    </div>
  </>;
}

const deviceNames: Record<string, string> = {
  available: "Available", unavailable: "Unavailable", downloadable: "Download available",
  downloading: "Downloading", unsupported: "Unsupported", unknown: "Unknown",
};

const descriptions: Record<Policy, string> = {
  "prefer-device": "Try the local model first. Flag uncertainty and request cloud permission for escalation.",
  "device-only": "Evaluate with the device model and route unresolved answers to teacher review.",
  "cloud-first": "Start in the cloud with permission, then try the device if cloud grading is unavailable.",
  "cloud-only": "Use the cloud with permission. Keep unresolved answers in the review queue.",
};

export function Preferences({ inference, online, settings, save }: {
  inference: Inference; online: boolean; settings: Settings; save: (value: Settings) => Promise<void>;
}) {
  const [availability, setAvailability] = useState("Checking…");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deviceProgress, setDeviceProgress] = useState<number>();
  const [preparing, setPreparing] = useState(false);
  const [policy, setPolicy] = useState(settings.policy);
  const [inputPrice, setInputPrice] = useState(settings.inputPerMillion?.toString() ?? "");
  const [outputPrice, setOutputPrice] = useState(settings.outputPerMillion?.toString() ?? "");
  const model = import.meta.env.VITE_FIREBASE_CLOUD_MODEL || DEFAULT_CLOUD_MODEL;

  useEffect(() => {
    let staled = false;
    void inference.deviceAvailability().then((value) => { if (!staled) setAvailability(deviceNames[value] ?? value); }).catch(() => { if (!staled) setAvailability("Unavailable"); });
    return () => { staled = true; };
  }, [inference]);

  async function enableDevice() {
    setPreparing(true);
    setError("");
    try {
      await inference.initializeDevice(setDeviceProgress);
      const state = await inference.deviceAvailability();
      setAvailability(deviceNames[state] ?? state);
    } catch (failure) {
      setError(readableError(failure));
      setAvailability("Unavailable");
    } finally {
      setPreparing(false);
      setDeviceProgress(undefined);
    }
  }

  async function saveSettings() {
    const input = inputPrice === "" ? null : Number(inputPrice);
    const output = outputPrice === "" ? null : Number(outputPrice);
    if ([input, output].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setError("Enter non-negative USD token rates.");
      return;
    }
    try {
      await save({ policy, inputPerMillion: input, outputPerMillion: output });
      setError("");
      setMessage("Inference preferences saved.");
    } catch (failure) {
      setError(readableError(failure));
      setMessage("");
    }
  }

  return <>
    <PageTitle title="Inference settings" description="Check model availability and control how GradeWise processes student answers." />
    <div className="dashboard-grid equal-grid">
      <section className="card">
        <header className="card-header"><div><h2>Model availability</h2><p>Prepare the Chrome model on this device.</p></div><span className="stat-icon stat-violet"><Activity size={21} /></span></header>
        <div className="card-body form-stack">
          <dl className="value-list"><div><dt><Cpu size={17} /> Gemini Nano</dt><dd><Badge tone={availability === "Available" ? "success" : "default"}>{availability}</Badge></dd></div>
            <div><dt><Cloud size={17} /> {model}</dt><dd><Badge tone={inference.cloudConfigured ? "success" : "warning"}>{inference.cloudConfigured ? "Configured" : "Configuration required"}</Badge></dd></div>
            <div><dt><Router size={17} /> Network</dt><dd><Badge tone={online ? "success" : "warning"}>{online ? "Online" : "Offline"}</Badge></dd></div></dl>
          <p className="muted">On-device grading requires desktop Chrome with a supported device and the Gemini Nano model installed.</p>
          <div><Button variant="primary" disabled={preparing} onClick={() => void enableDevice()}><Zap size={16} /> {preparing ? `Preparing${deviceProgress === undefined ? "…" : ` · ${Math.round(deviceProgress * 100)}%`}` : "Enable device model"}</Button></div>
        </div>
      </section>
      <section className="card">
        <header className="card-header"><div><h2>Grading policy</h2><p>Applies to each new grading run.</p></div><span className="stat-icon stat-green"><ShieldCheck size={21} /></span></header>
        <div className="card-body form-stack">
          <SelectField label="Default inference policy" value={policy} onChange={(event) => { setPolicy(event.target.value as Policy); setMessage(""); }}>
            {Object.entries(policyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <Notice>{descriptions[policy]} Each cloud-enabled run requires explicit consent.</Notice>
          <p className="muted">Approved rubrics, answer text and teacher decisions are stored in this browser profile.</p>
        </div>
      </section>
    </div>
    <section className="card workflow-card">
      <header className="card-header"><div><h2>Cloud cost estimation</h2><p>Enter USD pricing per million tokens for the configured model.</p></div><span className="stat-icon stat-blue"><Gauge size={20} /></span></header>
      <div className="card-body form-stack">
        {model !== DEFAULT_CLOUD_MODEL && <Notice>Initial rates are for {DEFAULT_CLOUD_MODEL}. Update them for {model}.</Notice>}
        <div className="field-grid"><Field label="Input USD per million tokens"><input type="number" min="0" step="any" value={inputPrice} placeholder="Enter rate" onChange={(event) => { setInputPrice(event.target.value); setMessage(""); }} /></Field>
          <Field label="Output USD per million tokens"><input type="number" min="0" step="any" value={outputPrice} placeholder="Enter rate" onChange={(event) => { setOutputPrice(event.target.value); setMessage(""); }} /></Field></div>
        {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}
        <div className="panel-actions"><Button variant="primary" onClick={() => void saveSettings()}><Check size={16} /> Save preferences</Button></div>
      </div>
    </section>
  </>;
}
