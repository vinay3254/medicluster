import React, { useMemo, useState } from "react";
import PatientMediaModal from "./PatientMediaModal";
import { usePageCapacity } from "./viewport-ui";

const TIER_COLORS = {
  Low:      "badge-low",
  Moderate: "badge-moderate",
  High:     "badge-high",
  Critical: "badge-critical",
  Noise:    "badge-noise",
};

export default function PatientTable({ patients = [] }) {
  const [host, pageSize] = usePageCapacity({ rowHeight: 58, reserved: 220, max: 20 });
  const [mobileColumn, setMobileColumn] = useState("age");
  const [search, setSearch]     = useState("");
  const [tierFilter, setTier]   = useState("All");
  const [sortKey, setSortKey]   = useState("patient_id");
  const [sortDir, setSortDir]   = useState("asc");
  const [page, setPage]         = useState(1);
  const [mediaPatient, setMediaPatient] = useState(null);

  const tiers = ["All", "Low", "Moderate", "High", "Critical", "Noise"];

  const filtered = useMemo(() => {
    let rows = patients;
    if (search)
      rows = rows.filter((p) =>
        String(p.patient_id).toLowerCase().includes(search.toLowerCase())
      );
    if (tierFilter !== "All")
      rows = rows.filter((p) => p.risk_tier === tierFilter);
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [patients, search, tierFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const sort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  const exportCSV = () => {
    const cols = ["patient_id", "cluster_id", "risk_tier", "age", "bmi", "systolic_bp", "glucose", "pca_x", "pca_y"];
    const header = cols.join(",");
    const lines  = filtered.map((p) => cols.map((c) => csvCell(p[c])).join(","));
    const blob   = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href = url;
    a.download = "medicluster_results.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const columns = [
    { key: "patient_id",  label: "Patient ID" },
    { key: "age",         label: "Age" },
    { key: "bmi",         label: "BMI" },
    { key: "systolic_bp", label: "Sys BP" },
    { key: "glucose",     label: "Glucose" },
    { key: "risk_tier",   label: "Risk Tier" },
    { key: "cluster_id",  label: "Cluster" },
    { key: "_files",      label: "Files", noSort: true },
  ];

  return (
    <div ref={host} className="mc-patient-table panel space-y-3 fade-in" data-column={mobileColumn}>
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <p className="section-label mb-0">Patient Table ({filtered.length} records)</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search patient ID…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input-field w-44 text-xs"
          />
          <select
            value={tierFilter}
            onChange={(e) => { setTier(e.target.value); setPage(1); }}
            className="input-field w-36 text-xs"
          >
            {tiers.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button onClick={exportCSV} className="btn-secondary text-xs py-1.5 px-3">
            Export CSV
          </button>
        </div>
      </div>

      <label className="mc-patient-column">Patient metric<select value={mobileColumn} onChange={event => setMobileColumn(event.target.value)}>{columns.filter(col => !["patient_id", "risk_tier", "_files"].includes(col.key)).map(col => <option key={col.key} value={col.key}>{col.label}</option>)}</select></label>
      <div className="mc-patient-rows overflow-x-auto rounded-[3px] border border-navy-700">
        <table className="w-full text-xs text-left">
          <thead className="bg-navy-800 text-slate-500 uppercase tracking-wide">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key} data-column={col.key}
                  onClick={() => !col.noSort && sort(col.key)}
                  className={`px-3 py-2.5 select-none whitespace-nowrap ${col.noSort ? "" : "cursor-pointer hover:text-blue-700"}`}
                >
                  {col.label}
                  {!col.noSort && sortKey === col.key && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-600" >
                  No results match filters
                </td>
              </tr>
            ) : (
              pageRows.map((p, i) => (
                <tr
                  key={i}
                  className="border-t border-navy-700 hover:bg-navy-700/40 transition-colors"
                >
                  <td className="px-3 py-2 font-mono text-blue-700">{p.patient_id}</td>
                  <td data-column="age" className="px-3 py-2 font-mono">{p.age ?? "—"}</td>
                  <td data-column="bmi" className="px-3 py-2 font-mono">{fmt(p.bmi)}</td>
                  <td data-column="systolic_bp" className="px-3 py-2 font-mono">{p.systolic_bp ?? "—"}</td>
                  <td data-column="glucose" className="px-3 py-2 font-mono">{fmt(p.glucose)}</td>
                  <td className="px-3 py-2">
                    <span className={TIER_COLORS[p.risk_tier] ?? "badge-noise"}>
                      {p.risk_tier ?? "?"}
                    </span>
                  </td>
                  <td data-column="cluster_id" className="px-3 py-2 font-mono text-slate-500">{p.cluster_id}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setMediaPatient(p.patient_id)}
                      className="btn-secondary text-xs py-0.5 px-2"
                      title="Upload / view CT scans & documents"
                    >
                      Files
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Page {currentPage} of {totalPages}</span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="btn-secondary text-xs py-1 px-2 disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="btn-secondary text-xs py-1 px-2 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>

      {mediaPatient && (
        <PatientMediaModal
          patientId={mediaPatient}
          onClose={() => setMediaPatient(null)}
        />
      )}
    </div>
  );
}

const fmt = (v) => (v !== undefined && v !== null ? Number(v).toFixed(1) : "—");

const csvCell = (value) => {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
