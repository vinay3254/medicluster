import { useEffect, useMemo, useState } from "react";
import { getPatientClusterHistory, listPatientMedia, listReminders } from "../api/apiClient";
import { useAuth } from "../auth/AuthContext";
import { Page, Segmented, Tag } from "../components/ui";
import { TIER_RANK, VITALS, adherence7d, fmtVital, loadLatestRuns, shortDate, vitalStatus } from "../data/clinical";

import { Pager, ScreenViews, usePageCapacity } from "../components/viewport-ui";
import "./records-viewport.css";

const SECTIONS = [
  { key: "summary",     label: "Summary" },
  { key: "vitals",      label: "Vitals & reference ranges" },
  { key: "tier",        label: "Risk tier & cluster" },
  { key: "medications", label: "Medications" },
  { key: "findings",    label: "Recent findings" },
];
const PERIODS = [{ value: 30, label: "30 d" }, { value: 90, label: "90 d" }, { value: 365, label: "1 yr" }];
const STATUS_TEXT = { High: "text-red-700", Low: "text-amber-700", Normal: "text-green-700" };

function downloadCsv(patient, rows) {
  const lines = [["measure", "value", "unit", "ref_low", "ref_high", "status"],
    ...rows.map((v) => [v.label, patient[v.key] ?? "", v.unit, v.ref[0], v.ref[1], vitalStatus(v, patient[v.key]) ?? ""])];
  const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${patient.patient_id}-risk-report.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [pid, setPid] = useState("");
  const [include, setInclude] = useState(() => Object.fromEntries(SECTIONS.map((s) => [s.key, true])));
  const [period, setPeriod] = useState(90);
  const [format, setFormat] = useState("pdf");
  const [history, setHistory] = useState([]);
  const [media, setMedia] = useState([]);
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    loadLatestRuns().then(({ latest }) => {
      const ps = [...(latest?.patients ?? [])].sort((a, b) => (TIER_RANK[b.risk_tier] ?? 0) - (TIER_RANK[a.risk_tier] ?? 0));
      setPatients(ps);
      setPid((cur) => cur || ps[0]?.patient_id || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pid) return undefined;
    let alive = true;
    getPatientClusterHistory(pid).then((h) => alive && setHistory(h)).catch(() => alive && setHistory([]));
    listPatientMedia(pid).then((m) => alive && setMedia(m)).catch(() => alive && setMedia([]));
    listReminders(pid).then((r) => alive && setReminders(r)).catch(() => alive && setReminders([]));
    return () => { alive = false; };
  }, [pid]);

  const patient = patients.find((p) => p.patient_id === pid);
  const since = Date.now() - period * 86_400_000;
  const findings = useMemo(() => [
    ...history.map((h) => ({ at: h.createdAt, text: `Assigned ${h.risk_tier} tier, cluster C${h.cluster_id}` })),
    ...media.map((m) => ({ at: m.uploadedAt, text: `Uploaded ${m.filename}` })),
  ].filter((e) => new Date(e.at) >= since).sort((a, b) => new Date(b.at) - new Date(a.at)), [history, media, since]);

  const abnormal = patient ? VITALS.filter((v) => vitalStatus(v, patient[v.key]) && vitalStatus(v, patient[v.key]) !== "Normal") : [];
  const tiers = history.filter((h) => new Date(h.createdAt) >= since).map((h) => h.risk_tier);
  const summary = !patient ? "" : [
    tiers.length > 1 && tiers[tiers.length - 1] !== tiers[0]
      ? `Risk moved from ${tiers[tiers.length - 1]} to ${tiers[0]} over the last ${PERIODS.find((p) => p.value === period).label}.`
      : `Currently ${patient.risk_tier} risk.`,
    abnormal.length ? `Outside reference range: ${abnormal.map((v) => v.label).join(", ")}.` : "All recorded vitals within reference range.",
  ].join(" ");

  const exportReport = () => {
    if (format === "csv") return downloadCsv(patient, VITALS);
    document.body.classList.add("printing-report");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-report"), { once: true });
    window.print();
  };
  const generated = new Date().toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const previewViews = [
    include.summary && { id: "summary", label: "Summary", content: <section className="record-card record-summary"><h2>Patient risk report</h2><p>{summary}</p><p className="record-muted">Generated {generated}<br />{user?.name}{user?.department && ` · ${user.department}`}</p></section> },
    include.vitals && { id: "vitals", label: "Vitals", content: <section className="record-card"><h2>Vitals & reference ranges</h2><ReportRows label="Report vital pages" items={VITALS} render={v => <div className="record-value"><span><strong>{v.label}</strong><small>Reference {v.ref[0]}–{v.ref[1]} {v.unit}</small></span><span>{fmtVital(v, patient?.[v.key])} {v.unit}<small>{vitalStatus(v, patient?.[v.key]) || "Not recorded"}</small></span></div>} /></section> },
    include.tier && { id: "tier", label: "Risk", content: <section className="record-card record-summary"><h2>Risk tier & cluster</h2><p><Tag tone={patient?.risk_tier} /></p><p>Cluster C{patient?.cluster_id}</p><p>{[patient?.age != null && `${Math.round(patient.age)} years`, patient?.gender].filter(Boolean).join(" · ")}</p></section> },
    include.medications && { id: "medications", label: "Medicines", content: <section className="record-card"><h2>Medications</h2><ReportRows label="Report medicine pages" items={reminders} render={r => <div><strong>{r.medicationName} {r.dosage}</strong><small>{r.frequency}{!r.active && " · paused"}{adherence7d(r) != null && ` · ${Math.round(adherence7d(r) * 100)}% taken (7 d)`}</small></div>} /></section> },
    include.findings && { id: "findings", label: "Findings", content: <section className="record-card"><h2>Recent findings</h2><ReportRows label="Report finding pages" items={findings} render={f => <div><strong>{f.text}</strong><small>{shortDate(f.at)}</small></div>} /></section> },
    { id: "notes", label: "Notes", content: <section className="record-card record-summary"><h2>Clinical notes</h2><p>Risk tiers are derived from unsupervised clustering and are decision support, not a diagnosis.</p><p>Signature ____________________</p><p className="record-muted">Export includes every selected section and all its records.</p></section> },
  ];
  return <Page className="records-page reports-page" title="Reports" sub="Build a patient risk report to share, print or send to another system." actions={<button type="button" onClick={exportReport} disabled={!patient} className="btn-primary">Export {format.toUpperCase()}</button>}>
    <ScreenViews label="Report workspace views" views={[
      { id: "settings", label: "Patient & format", content: <section className="record-card report-settings"><h2>Report settings</h2><label>Patient<select aria-label="Report patient" value={pid} onChange={e => setPid(e.target.value)} disabled={!patients.length}>{!patients.length && <option>Run clustering to list patients</option>}{patients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.patient_id} · {p.risk_tier}</option>)}</select></label><div><p>Period</p><Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} /></div><div><p>Format</p><Segmented label="Format" value={format} onChange={setFormat} options={[{ value: "pdf", label: "PDF" }, { value: "csv", label: "CSV" }]} /></div><p className="record-muted">Select the sections to include, then review the preview before exporting.</p></section> },
      { id: "sections", label: "Included sections", content: <section className="record-card report-includes"><h2>Include in report</h2>{SECTIONS.map(section => <label key={section.key}><input type="checkbox" checked={include[section.key]} onChange={e => setInclude(old => ({ ...old, [section.key]: e.target.checked }))} />{section.label}</label>)}</section> },
      { id: "preview", label: "Preview", content: patient ? <div className="report-preview"><header className="record-identity"><h2>{patient.patient_id}</h2><span>Report preview</span></header><ScreenViews label="Report preview sections" views={previewViews} /></div> : <section className="record-card"><h2>Report preview</h2><p>Run clustering and select a patient to preview their report.</p></section> },
    ]} />
    {patient && <div className="record-print-template"><article id="report" className="bg-surface max-w-[680px] mx-auto p-8 sm:p-12 flex flex-col gap-7 shadow-sm print:shadow-none">
              <header className="flex justify-between gap-4 pb-4 border-b-2 border-ink">
                <div>
                  <p className="font-serif text-xl">MediCluster</p>
                  <p className="eyebrow mt-1">Patient risk report</p>
                </div>
                <p className="font-mono text-[11px] text-slate-500 text-right leading-relaxed">
                  Generated {generated}<br />{user?.name}{user?.department && ` · ${user.department}`}
                </p>
              </header>

              <div className="flex justify-between items-end gap-4">
                <div>
                  <h2 className="font-serif text-[34px] leading-none">{patient.patient_id}</h2>
                  <p className="text-[13px] text-slate-600 mt-2">
                    {[patient.age != null && Math.round(patient.age), patient.gender, `Cluster C${patient.cluster_id}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {include.tier && <div className="text-right"><p className="eyebrow mb-1">Risk tier</p><Tag tone={patient.risk_tier} /></div>}
              </div>

              {include.summary && (
                <div><p className="eyebrow mb-1.5">Summary</p><p className="font-serif text-[17px] leading-snug">{summary}</p></div>
              )}

              {include.vitals && (
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="eyebrow text-left border-b border-ink">
                      <th className="py-1.5 font-normal">Measure</th><th className="py-1.5 font-normal text-right">Value</th>
                      <th className="py-1.5 font-normal text-right">Reference</th><th className="py-1.5 font-normal text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VITALS.map((v) => {
                      const st = vitalStatus(v, patient[v.key]);
                      return (
                        <tr key={v.key} className="border-b border-line">
                          <td className="py-2">{v.label}</td>
                          <td className="py-2 text-right font-mono">{fmtVital(v, patient[v.key])} <span className="text-slate-500">{v.unit}</span></td>
                          <td className="py-2 text-right font-mono text-slate-500">{v.ref[0]}–{v.ref[1]}</td>
                          <td className={`py-2 text-right font-mono text-[11px] uppercase ${STATUS_TEXT[st] ?? "text-slate-500"}`}>{st ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {(include.medications || include.findings) && (
                <div className="grid gap-6 sm:grid-cols-2 text-[12.5px]">
                  {include.medications && (
                    <div>
                      <p className="eyebrow mb-2">Medications</p>
                      {reminders.length === 0 && <p className="text-slate-500">None recorded.</p>}
                      {reminders.map((r) => {
                        const pct = adherence7d(r);
                        return (
                          <p key={r._id} className="py-0.5">
                            {r.medicationName} {r.dosage}
                            <span className="text-slate-500"> · {r.frequency}{!r.active && " · paused"}{pct != null && ` · ${Math.round(pct * 100)}% taken (7 d)`}</span>
                          </p>
                        );
                      })}
                    </div>
                  )}
                  {include.findings && (
                    <div>
                      <p className="eyebrow mb-2">Recent findings</p>
                      {findings.length === 0 && <p className="text-slate-500">None in this period.</p>}
                      {findings.map((f, i) => <p key={i} className="py-0.5">{shortDate(f.at)} — {f.text}</p>)}
                    </div>
                  )}
                </div>
              )}

              <footer className="flex justify-between items-end gap-6 pt-5 border-t border-line text-[11px] text-slate-500">
                <p className="max-w-[300px]">Risk tiers are derived from unsupervised clustering and are decision support, not a diagnosis.</p>
                <p className="w-40 pt-1 border-t border-ink text-right">Signature</p>
              </footer>
            </article></div>}
  </Page>;
}

function ReportRows({ items, render, label }) {
  const [ref, size] = usePageCapacity({ rowHeight: 76, reserved: 0, max: 100 });
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const active = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [items]);
  return <div className="record-paged-list"><div className="record-rows" ref={ref}>{items.length ? items.slice(active * size, (active + 1) * size).map((item, i) => <div className="record-row" key={item._id || item.key || i}>{render(item)}</div>) : <p>None recorded in this period.</p>}</div><Pager page={active} pages={pages} onChange={setPage} label={label} /></div>;
}
