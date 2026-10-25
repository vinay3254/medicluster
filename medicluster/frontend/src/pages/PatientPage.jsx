import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getMediaFileUrl, getPatientClusterHistory, getPatientProfile, listPatientMedia,
  listReminders, updatePatientProfile, listClinicAppointments, listPatientAppointments,
  updatePatientAppointment,
} from "../api/apiClient";
import { TIER_RANK, VITALS, adherence7d, flagReason, fmtVital, loadLatestRuns, runId, shortDate, vitalStatus } from "../data/clinical";
import { Page, Tag, Segmented, linkCls } from "../components/ui";
import { Pager, ScreenViews, usePageCapacity } from "../components/viewport-ui";
import "./records-viewport.css";

const APPT_STATUS_TONES = {
  REQUESTED: "moderate",
  CONFIRMED: "low",
  CANCELLED: "noise",
  COMPLETED: "noise",
};

const APPT_STATUS_LABELS = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

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

function Roster({ patients, selectedId, onPick, onOpenInbox }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => patients.filter(p => String(p.patient_id).toLowerCase().includes(q.trim().toLowerCase())), [patients, q]);
  return <section className="record-card record-roster" aria-label="Patient roster">
    <h2>Patient directory <span>{patients.length}</span></h2>
    <button type="button" className="btn-secondary" onClick={onOpenInbox}>Clinic appointment inbox</button>
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

function ClinicAppointmentInbox({ onPickPatient }) {
  const [appointments, setAppointments] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    listClinicAppointments()
      .then(items => { setAppointments(items || []); setError(""); })
      .catch(err => setError(err?.response?.data?.error || err.message || "Could not load clinic appointments."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const handleStatus = async (appt, newStatus) => {
    setBusyId(appt._id);
    setError("");
    try {
      const updated = await updatePatientAppointment(appt.patientId, appt._id, { status: newStatus });
      setAppointments(prev => prev.map(a => a._id === updated._id ? updated : a));
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Could not update appointment.");
    } finally {
      setBusyId("");
    }
  };

  const filtered = useMemo(() => {
    if (filter === "REQUESTED") return appointments.filter(a => a.status === "REQUESTED");
    if (filter === "CONFIRMED") return appointments.filter(a => a.status === "CONFIRMED");
    return appointments;
  }, [appointments, filter]);

  const requestedCount = appointments.filter(a => a.status === "REQUESTED").length;

  return (
    <section className="record-card record-summary" aria-label="Clinic appointment inbox">
      <div className="record-card-title">
        <h2>Clinic appointment queue <span>{appointments.length}</span></h2>
        <button type="button" className="btn-secondary text-xs py-1 px-2.5" onClick={reload} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="text-slate-600 text-xs m-0">
        Review incoming appointment requests submitted by patients and confirm or cancel them.
        {requestedCount > 0 ? ` ${requestedCount} awaiting review.` : " No requests currently awaiting confirmation."}
      </p>
      {error && <p role="alert" className="text-xs text-red-700 m-0">{error}</p>}
      <Segmented
        label="Appointment filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `All (${appointments.length})` },
          { value: "REQUESTED", label: `Pending (${requestedCount})` },
          { value: "CONFIRMED", label: "Confirmed" },
        ]}
      />
      <RecordRows
        label="Clinic appointment queue pages"
        items={filtered}
        rowHeight={144}
        empty={loading ? "Loading appointments…" : "No appointments in this view."}
        render={appt => (
          <div className="flex flex-col gap-1 w-full text-[13px] py-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="font-mono font-medium text-ink hover:underline text-left"
                  onClick={() => onPickPatient(appt.patientId)}
                >
                  {appt.patientId}
                </button>
                <small className="text-slate-500">
                  {new Date(appt.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </small>
              </div>
              <Tag tone={APPT_STATUS_TONES[appt.status]}>{APPT_STATUS_LABELS[appt.status] || appt.status}</Tag>
            </div>
            <div className="text-xs text-slate-700">
              <span>{appt.doctor || "Care team"}</span>
              {appt.location && <span> · {appt.location}</span>}
              {appt.department && <span> ({appt.department})</span>}
            </div>
            {appt.reason && <p className="text-xs text-slate-500 m-0 line-clamp-1">{appt.reason}</p>}
            <div className="flex items-center gap-2 mt-1">
              {appt.status === "REQUESTED" && (
                <>
                  <button
                    type="button"
                    className="btn-primary text-xs py-1 px-2.5"
                    disabled={busyId === appt._id}
                    onClick={() => handleStatus(appt, "CONFIRMED")}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1 px-2.5"
                    disabled={busyId === appt._id}
                    onClick={() => handleStatus(appt, "CANCELLED")}
                  >
                    Cancel
                  </button>
                </>
              )}
              {appt.status === "CONFIRMED" && (
                <>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1 px-2.5"
                    disabled={busyId === appt._id}
                    onClick={() => handleStatus(appt, "COMPLETED")}
                  >
                    Mark completed
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1 px-2.5"
                    disabled={busyId === appt._id}
                    onClick={() => handleStatus(appt, "CANCELLED")}
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                className="text-xs text-ink underline ml-auto"
                onClick={() => onPickPatient(appt.patientId)}
              >
                Open patient ›
              </button>
            </div>
          </div>
        )}
      />
    </section>
  );
}

function Profile({ patientId, patient }) {
  const [history, setHistory] = useState([]);
  const [media, setMedia] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [apptBusy, setApptBusy] = useState("");
  const [apptError, setApptError] = useState("");

  useEffect(() => {
    let alive = true;
    setHistory([]); setMedia([]); setReminders([]); setAppointments([]);
    getPatientClusterHistory(patientId).then(v => alive && setHistory(v)).catch(() => {});
    listPatientMedia(patientId).then(v => alive && setMedia(v)).catch(() => {});
    listReminders(patientId).then(v => alive && setReminders(v)).catch(() => {});
    setApptError("");
    listPatientAppointments(patientId).then(v => alive && setAppointments(v || []))
      .catch(err => alive && setApptError(err?.response?.data?.error || err.message || "Could not load appointments."));
    return () => { alive = false; };
  }, [patientId]);

  const handleApptStatus = async (appt, newStatus) => {
    setApptBusy(appt._id);
    setApptError("");
    try {
      const updated = await updatePatientAppointment(patientId, appt._id, { status: newStatus });
      setAppointments(prev => prev.map(a => a._id === updated._id ? updated : a));
    } catch (err) {
      setApptError(err?.response?.data?.error || err.message || "Could not update appointment status");
    } finally {
      setApptBusy("");
    }
  };

  const tier = history[0]?.risk_tier ?? patient?.risk_tier;
  const summary = summarize(history, patient);
  const pid = encodeURIComponent(patientId);
  return <div className="record-profile">
    <header className="record-identity"><h2>{patientId}</h2>{tier && <Tag tone={tier} />}</header>
    <ScreenViews key={patientId} label="Patient record sections" views={[
      { id: "summary", label: "Summary", content: <section className="record-card record-summary"><h2>Patient overview</h2><p>{[patient?.age != null && `${Math.round(patient.age)} years`, patient?.gender, patient && `Cluster C${patient.cluster_id}`].filter(Boolean).join(" · ") || "Not in the latest clustering run"}</p><p>{summary || "No clustering history is available yet."}</p><p>{history[0] && `Last clustered ${shortDate(history[0].createdAt)}`}</p><div className="record-links"><Link className="btn-primary" to="/predict">Re-run prediction</Link><Link className="btn-secondary" to={`/reminders/${pid}`}>Medication reminders</Link><Link className="btn-secondary" to="/imaging">Imaging</Link></div></section> },
      { id: "vitals", label: "Vitals", content: <section className="record-card"><h2>Vitals & reference ranges</h2>{patient ? <RecordRows label="Vital pages" items={VITALS} render={v => <div className="record-value"><span><strong>{v.label}</strong><small>Reference {v.ref[0]}–{v.ref[1]} {v.unit}</small></span><span>{fmtVital(v, patient[v.key])} {v.unit}<small>{vitalStatus(v, patient[v.key]) || "Not recorded"}</small></span></div>} /> : <p>Vitals come from the latest clustering run; this patient isn’t in it.</p>}</section> },
      { id: "appointments", label: "Appointments", content: <section className="record-card">
        <div className="record-card-title">
          <h2>Appointments & care requests <span>{appointments.length}</span></h2>
        </div>
        {apptError && <p role="alert" className="text-xs text-red-700 m-0">{apptError}</p>}
        <RecordRows label="Appointment pages" items={appointments} empty="No appointments on file for this patient." render={appt => <div className="flex flex-col gap-1.5 py-1 w-full text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <strong>{new Date(appt.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
              <small>{appt.doctor || 'Care team'}{appt.department ? ` · ${appt.department}` : ''}{appt.location ? ` · ${appt.location}` : ''}</small>
            </div>
            <Tag tone={APPT_STATUS_TONES[appt.status]}>{APPT_STATUS_LABELS[appt.status] || appt.status}</Tag>
          </div>
          {appt.reason && <p className="text-xs text-slate-600 m-0">{appt.reason}</p>}
          <div className="flex items-center gap-2 mt-1">
            {appt.status === 'REQUESTED' && <>
              <button type="button" className="btn-primary text-xs py-1 px-2.5" disabled={apptBusy === appt._id} onClick={() => handleApptStatus(appt, 'CONFIRMED')}>Confirm</button>
              <button type="button" className="btn-secondary text-xs py-1 px-2.5" disabled={apptBusy === appt._id} onClick={() => handleApptStatus(appt, 'CANCELLED')}>Cancel</button>
            </>}
            {appt.status === 'CONFIRMED' && <>
              <button type="button" className="btn-secondary text-xs py-1 px-2.5" disabled={apptBusy === appt._id} onClick={() => handleApptStatus(appt, 'COMPLETED')}>Mark completed</button>
              <button type="button" className="btn-secondary text-xs py-1 px-2.5" disabled={apptBusy === appt._id} onClick={() => handleApptStatus(appt, 'CANCELLED')}>Cancel</button>
            </>}
          </div>
        </div>} />
      </section> },
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
  useEffect(() => { if (patientId) setShowProfile(true); }, [patientId]);
  const sorted = useMemo(() => [...roster].sort((a, b) => (TIER_RANK[b.risk_tier] ?? 0) - (TIER_RANK[a.risk_tier] ?? 0)), [roster]);
  return <Page className="records-page" title="Patients" sub="Look up a patient to see their profile, vitals, risk tier and history.">
    <div className={`record-layout ${showProfile ? "record-show-profile" : ""}`}>
      <Roster patients={sorted} selectedId={patientId} onOpenInbox={() => { navigate('/patient'); setShowProfile(true); }} onPick={id => { if (id) { navigate(`/patient/${encodeURIComponent(id)}`); setShowProfile(true); } }} />
      <div className="record-profile-pane"><button type="button" className="record-back btn-secondary" onClick={() => setShowProfile(false)}>← Patient directory</button>{patientId ? <Profile patientId={patientId} patient={roster.find(p => p.patient_id === patientId)} /> : <ClinicAppointmentInbox onPickPatient={id => { if (id) { navigate(`/patient/${encodeURIComponent(id)}`); setShowProfile(true); } }} />}</div>
    </div>
  </Page>;
}
