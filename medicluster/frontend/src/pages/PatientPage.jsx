import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getMediaFileUrl, getPatientClusterHistory, getPatientProfile, listPatientMedia, listReminders, updatePatientProfile } from "../api/apiClient";
import { TIER_RANK, VITALS, adherence7d, flagReason, fmtVital, loadLatestRuns, runId, shortDate, vitalStatus } from "../data/clinical";
import { Page, Tag, linkCls } from "../components/ui";
import { Pager, ScreenViews, usePageCapacity } from "../components/viewport-ui";
import "./records-viewport.css";

function RecordRows({ items, render, label, empty = "None recorded.", rowHeight = 76 }) {
  const [ref, size] = usePageCapacity({ rowHeight, reserved: 0, max: 100 });
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const active = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [items]);
  return <div className="record-paged-list"><div className="record-rows" ref={ref}>
    {items.length ? items.slice(active * size, (active + 1) * size).map((item, i) => <div className="record-row" style={{ minHeight: rowHeight }} key={item._id || item.fileId || item.resultId || item.patient_id || item.key || i}>{render(item)}</div>) : <p>{empty}</p>}
  </div><Pager page={active} pages={pages} onChange={setPage} label={label} /></div>;
}

function Roster({ patients, selectedId, onPick }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => patients.filter(p => String(p.patient_id).toLowerCase().includes(q.trim().toLowerCase())), [patients, q]);
  return <section className="record-card record-roster" aria-label="Patient roster">
    <h2>Patient directory <span>{patients.length}</span></h2>
    <form onSubmit={e => { e.preventDefault(); onPick(rows[0]?.patient_id || q.trim()); }}>
      <input className="input-field" value={q} onChange={e => setQ(e.target.value)} aria-label="Search patients" placeholder="Search by patient ID" />
    </form>
    <RecordRows items={rows} rowHeight={64} label="Patient directory pages" empty="No match. Enter an ID and press Enter to open their record." render={p => <button type="button" className={`record-patient-pick ${selectedId === p.patient_id ? "is-selected" : ""}`} aria-current={selectedId === p.patient_id ? "true" : undefined} onClick={() => onPick(p.patient_id)}><span><strong>{p.patient_id}</strong><small>{p.age != null ? Math.round(p.age) : "Age unknown"} · {p.gender || ""} · C{p.cluster_id}</small></span><Tag tone={p.risk_tier} /></button>} />
  </section>;
}
function AppSignIn({ patientId }) {
  const [saved, setSaved] = useState("");
  const [value, setValue] = useState("");
  const [state, setState] = useState({ busy: false, error: "", ok: false });

  useEffect(() => {
    let alive = true;
    getPatientProfile(patientId).then((p) => { if (alive) { setSaved(p?.mobile || ""); setValue(p?.mobile || ""); } }).catch(() => {});
    return () => { alive = false; };
  }, [patientId]);

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: "", ok: false });
    try {
      const p = await updatePatientProfile(patientId, { mobile: value.trim() });
      setSaved(p.mobile || "");
      setValue(p.mobile || "");
      setState({ busy: false, error: "", ok: true });
    } catch (err) {
      setState({ busy: false, error: err?.response?.data?.error || "Couldn’t save the number.", ok: false });
    }
  };

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
      <label htmlFor="app-mobile" className="text-slate-600">Patient app sign-in</label>
      <span className="font-mono text-slate-500">+91</span>
      <input id="app-mobile" value={value} onChange={(e) => { setValue(e.target.value); setState((s) => ({ ...s, ok: false })); }}
        inputMode="tel" placeholder="Mobile number"
        className="h-8 w-36 bg-transparent border-b border-line-strong font-mono focus:outline-none focus:border-ink" />
      <button type="submit" disabled={state.busy || value.trim() === saved} className={`${linkCls} disabled:opacity-40 disabled:no-underline`}>
        {state.busy ? "Saving…" : saved && !value.trim() ? "Unlink" : "Save"}
      </button>
      {state.ok && <span className="text-green-700">{saved ? "Linked" : "Unlinked"}</span>}
      {state.error && <span role="alert" className="text-red-700">{state.error}</span>}
    </form>
  );
}

function summarize(history, patient) {
  const tiers = [...history].reverse().map((h) => h.risk_tier).filter((t) => TIER_RANK[t]);
  const drivers = patient ? flagReason(patient, "") : "";
  const why = drivers ? `, driven by ${drivers}` : "";
  if (tiers.length < 2) return tiers.length ? `Currently ${tiers[0]} risk${why}.` : null;
  const first = tiers[0], last = tiers[tiers.length - 1];
  const span = `${tiers.length} runs`;
  if (first === last) return `Risk steady at ${last} across ${span}${why}.`;
  return `Risk ${TIER_RANK[last] > TIER_RANK[first] ? "rose" : "fell"} from ${first} to ${last} over ${span}${why}.`;
}

function Profile({ patientId, patient }) {
  const [history, setHistory] = useState([]);
  const [media, setMedia] = useState([]);
  const [reminders, setReminders] = useState([]);
  useEffect(() => {
    let alive = true;
    setHistory([]); setMedia([]); setReminders([]);
    getPatientClusterHistory(patientId).then(v => alive && setHistory(v)).catch(() => {});
    listPatientMedia(patientId).then(v => alive && setMedia(v)).catch(() => {});
    listReminders(patientId).then(v => alive && setReminders(v)).catch(() => {});
    return () => { alive = false; };
  }, [patientId]);
  const tier = history[0]?.risk_tier ?? patient?.risk_tier;
  const summary = summarize(history, patient);
  const pid = encodeURIComponent(patientId);
  return <div className="record-profile">
    <header className="record-identity"><h2>{patientId}</h2>{tier && <Tag tone={tier} />}</header>
    <ScreenViews key={patientId} label="Patient record sections" views={[
      { id: "summary", label: "Summary", content: <section className="record-card record-summary"><h2>Patient overview</h2><p>{[patient?.age != null && `${Math.round(patient.age)} years`, patient?.gender, patient && `Cluster C${patient.cluster_id}`].filter(Boolean).join(" · ") || "Not in the latest clustering run"}</p><p>{summary || "No clustering history is available yet."}</p><p>{history[0] && `Last clustered ${shortDate(history[0].createdAt)}`}</p><div className="record-links"><Link className="btn-primary" to="/predict">Re-run prediction</Link><Link className="btn-secondary" to={`/reminders/${pid}`}>Medication reminders</Link><Link className="btn-secondary" to="/imaging">Imaging</Link></div></section> },
      { id: "vitals", label: "Vitals", content: <section className="record-card"><h2>Vitals & reference ranges</h2>{patient ? <RecordRows label="Vital pages" items={VITALS} render={v => <div className="record-value"><span><strong>{v.label}</strong><small>Reference {v.ref[0]}–{v.ref[1]} {v.unit}</small></span><span>{fmtVital(v, patient[v.key])} {v.unit}<small>{vitalStatus(v, patient[v.key]) || "Not recorded"}</small></span></div>} /> : <p>Vitals come from the latest clustering run; this patient isn’t in it.</p>}</section> },
      { id: "history", label: "History", content: <section className="record-card"><h2>Clustering history</h2><RecordRows label="History pages" items={history} render={h => <Link className="record-history-link" to={`/results/${h.resultId}`}><strong>{h.risk_tier} risk · Cluster C{h.cluster_id}</strong><small>{shortDate(h.createdAt)} · {runId({ _id: h.resultId })}</small></Link>} /></section> },
      { id: "medicines", label: "Medicines", content: <section className="record-card"><div className="record-card-title"><h2>Medication schedules</h2><Link className={linkCls} to={`/reminders/${pid}`}>Manage</Link></div><RecordRows label="Medicine pages" items={reminders} render={r => <div><strong>{r.medicationName} {r.dosage}</strong><small>{r.times?.length ? `${r.times.length}× ` : ""}{r.frequency}{!r.active && " · paused"} · {adherence7d(r) == null ? "No doses due" : `${Math.round(adherence7d(r) * 100)}% taken (7 d)`}</small></div>} /></section> },
      { id: "files", label: "Files", content: <section className="record-card"><h2>Imaging & files</h2><RecordRows label="File pages" items={media} render={m => <a href={getMediaFileUrl(m.fileId)} target="_blank" rel="noreferrer"><strong>{m.filename}</strong><small>{shortDate(m.uploadedAt)} · Open file ↗</small></a>} /></section> },
      { id: "access", label: "Access", content: <section className="record-card record-access"><h2>Patient app access</h2><p>Link the mobile number the patient uses to sign in to the patient app.</p><AppSignIn key={patientId} patientId={patientId} /></section> },
    ]} />
  </div>;
}

export default function PatientPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [roster, setRoster] = useState([]);
  const [showProfile, setShowProfile] = useState(Boolean(patientId));
  useEffect(() => { let alive = true; loadLatestRuns().then(({ latest }) => alive && setRoster(latest?.patients ?? [])).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => setShowProfile(Boolean(patientId)), [patientId]);
  const sorted = useMemo(() => [...roster].sort((a, b) => (TIER_RANK[b.risk_tier] ?? 0) - (TIER_RANK[a.risk_tier] ?? 0)), [roster]);
  return <Page className="records-page" title="Patients" sub="Look up a patient to see their profile, vitals, risk tier and history.">
    <div className={`record-layout ${showProfile ? "record-show-profile" : ""}`}>
      <Roster patients={sorted} selectedId={patientId} onPick={id => { if (id) { navigate(`/patient/${encodeURIComponent(id)}`); setShowProfile(true); } }} />
      <div className="record-profile-pane"><button type="button" className="record-back btn-secondary" onClick={() => setShowProfile(false)}>← Patient directory</button>{patientId ? <Profile patientId={patientId} patient={roster.find(p => p.patient_id === patientId)} /> : <section className="record-card"><h2>Patient record</h2><p>Pick a patient from the directory or search by ID.</p></section>}</div>
    </div>
  </Page>;
}
