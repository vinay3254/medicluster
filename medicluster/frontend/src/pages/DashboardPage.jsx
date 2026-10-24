import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import UploadPanel        from "../components/UploadPanel";
import AlgorithmSelector  from "../components/AlgorithmSelector";
import ClusterScatterPlot from "../components/ClusterScatterPlot";
import RiskBars           from "../components/RiskBars";
import { Page, Section, Tabs, Tag } from "../components/ui";
import MetricsPanel       from "../components/MetricsPanel";
import PatientTable       from "../components/PatientTable";
import ComparisonPanel    from "../components/ComparisonPanel";
import DendrogramView     from "../components/DendrogramView";
import ChartErrorBoundary from "../components/ChartErrorBoundary";
import AIClusterInsights  from "../components/AIClusterInsights";
import { runClustering, detectAnomalies, explainClusters } from "../api/apiClient";
import { ScreenViews, Pager, usePageCapacity } from "../components/viewport-ui";
import { exportToPdf }    from "../utils/exportPdf";

const TABS = ["Scatter", "Comparison", "Dendrogram", "Anomalies"].map((label, i) => ({ value: i, label }));

const TIER_CLASS = {
  Low:      "badge-low",
  Moderate: "badge-moderate",
  High:     "badge-high",
  Critical: "badge-critical",
  Noise:    "badge-noise",
};

function PatientDetailModal({ patient, clusterProfiles, featureNames, onClose }) {
  const cluster = clusterProfiles?.find((cp) => cp.cluster_id === patient.cluster_id);
  const centroid = cluster?.centroid_features ?? {};
  const features = featureNames.filter((f) => patient[f] !== undefined && patient[f] !== null);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-[3px] w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b border-line">
          <div>
            <p className="font-mono text-blue-700 font-semibold text-sm">{patient.patient_id ?? "—"}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={TIER_CLASS[patient.risk_tier] ?? "badge-noise"}>{patient.risk_tier}</span>
              <span className="text-xs text-slate-400">Cluster {patient.cluster_id}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Feature Values</p>
          {features.map((f) => {
            const val = patient[f];
            const cVal = centroid[f];
            const diff = cVal !== undefined ? val - cVal : null;
            return (
              <div key={f} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                <span className="text-slate-500 font-mono w-32 truncate">{f}</span>
                <div className="flex items-center gap-2">
                  {diff !== null && (
                    <span className={`text-xs font-mono ${Math.abs(diff) < 0.01 ? "text-slate-300" : diff > 0 ? "text-red-400" : "text-emerald-500"}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                    </span>
                  )}
                  <span className="font-mono text-slate-800 font-semibold">
                    {typeof val === "number" ? val.toFixed(2) : String(val)}
                  </span>
                </div>
              </div>
            );
          })}
          {cluster && (
            <p className="text-xs text-slate-300 pt-2">
              Δ vs Cluster {patient.cluster_id} centroid · {cluster.size} patients
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AnomalyWatchlist({ patients, anomalies, featureNames, onPatientClick }) {
  const [host, size] = usePageCapacity({rowHeight: 126, reserved: 90, max: 4});
  const [page, setPage] = useState(0);
  if (!anomalies) {
    return (
      <div className="panel flex items-center justify-center h-40">
        <p className="text-xs text-slate-400">Anomaly detection runs automatically after clustering…</p>
      </div>
    );
  }
  const flags  = anomalies.anomaly_flags  ?? [];
  const scores = anomalies.anomaly_scores ?? [];
  const flagged = patients.filter((_, i) => flags[i] === -1 || flags[i] === 1);
  if (!flagged.length) {
    return (
      <div className="panel flex flex-col items-center justify-center h-40 gap-2">
        <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <p className="text-xs text-slate-500">No anomalous patients detected.</p>
      </div>
    );
  }
  const pages = Math.max(1, Math.ceil(flagged.length / size));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div ref={host} className="mc-fit-card">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
          {flagged.length} Anomalous Patient{flagged.length !== 1 ? "s" : ""} Detected
        </span>
        <span className="text-xs text-slate-400">— statistical outliers from Isolation Forest</span>
      </div>
      <div className="space-y-2">
        {flagged.slice(currentPage*size,(currentPage+1)*size).map((p, i) => {
          const origIdx = patients.indexOf(p);
          const score   = scores[origIdx] ?? null;
          return (
            <div
              key={p.patient_id ?? i}
              onClick={() => onPatientClick(p)}
              className="panel border-red-200 bg-surface/30 cursor-pointer hover:border-red-400 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-700 shrink-0" />
                  <span className="font-mono text-sm font-semibold text-slate-700">{p.patient_id ?? `Row ${origIdx}`}</span>
                  <span className={TIER_CLASS[p.risk_tier] ?? "badge-noise"}>{p.risk_tier}</span>
                </div>
                {score !== null && (
                  <span className="text-xs font-mono text-red-500 bg-surface px-2 py-0.5 rounded-sm">
                    score: {score.toFixed(3)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {featureNames.slice(0, 6).map((f) => p[f] !== undefined && (
                  <span key={f} className="text-xs text-slate-500 font-mono">
                    {f}: <span className="text-slate-800 font-semibold">{typeof p[f] === "number" ? p[f].toFixed(1) : p[f]}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Pager page={currentPage} pages={pages} onChange={setPage} label="Anomalous patients" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-[3px] bg-slate-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-600">No results yet</p>
        <p className="text-xs text-slate-400 mt-1">Upload a dataset and run clustering to see results here.</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // Onboarding hands over the dataset it just uploaded.
  const { state: navState } = useLocation();
  const [setupView, setSetupView] = useState("dataset");
  const [dataset,         setDataset]         = useState(navState?.dataset ?? null);
  const [result,          setResult]          = useState(null);
  const [allResults,      setAllResults]      = useState(null);
  const [error,           setError]           = useState(null);
  const [warnings,        setWarnings]        = useState([]);
  const [activeTab,       setActiveTab]       = useState(0);
  const [runKey,          setRunKey]          = useState(0);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [anomalies,       setAnomalies]       = useState(null);   // { anomaly_flags, anomaly_scores }
  const [shapData,        setShapData]        = useState(null);   // { feature_importances, shap_values }
  const [shapLoading,     setShapLoading]     = useState(false);

  const handleDatasetLoaded = (ds) => {
    setDataset(ds);
    setSetupView("algorithm");
    setResult(null);
    setAllResults(null);
    setWarnings([]);
    setRunKey((k) => k + 1);
  };

  const handleRun = async (algorithm, params) => {
    if (!dataset) { setError("Upload a dataset first."); return; }
    setError(null);
    setWarnings([]);
    setAnomalies(null);
    setShapData(null);
    try {
      const inlineRows = dataset.datasetId === "__sample__" ? dataset.rawData : undefined;
      const res = await runClustering(dataset.datasetId, algorithm, params, inlineRows);
      setWarnings(collectWarnings(res));
      setRunKey((k) => k + 1);
      if (algorithm === "all") {
        setAllResults(res.all ?? {});
        setResult(null);
        setActiveTab(1);
      } else {
        setResult(res);
        setAllResults(null);
        setActiveTab(0);
        // auto-run anomaly detection in background
        if (res.patients?.length) {
          detectAnomalies(res.patients)
            .then((d) => setAnomalies(d))
            .catch(() => {});
        }
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Clustering failed");
    }
  };

  const loadShap = async () => {
    if (!result?.patients?.length || shapLoading) return;
    setShapLoading(true);
    try {
      const labels = result.patients.map((p) => p.cluster_id ?? 0);
      const data = await explainClusters(result.patients, labels);
      setShapData(data);
    } catch {
      // silently degrade
    } finally {
      setShapLoading(false);
    }
  };

  const activePatients   = result?.patients          ?? [];
  const activeMetrics    = result?.metrics           ?? {};
  const activeRiskDist   = result?.risk_distribution ?? {};
  const featureNames     = result?.feature_names     ?? [];
  const linkageMatrix    = result?.linkage_matrix    ?? [];
  const clusterProfiles  = result?.cluster_profiles  ?? [];
  const hasResults       = activePatients.length > 0 || allResults !== null;

  const featureImportance = useMemo(() => {
    if (!clusterProfiles.length || !featureNames.length) return [];
    const centroids = clusterProfiles.map((cp) => cp.centroid_features ?? {});
    const scored = featureNames.map((f) => {
      const vals = centroids.map((c) => Number(c[f]) || 0);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      return { feature: f, raw: std };
    });
    const maxRaw = Math.max(...scored.map((s) => s.raw), 1e-9);
    return scored
      .map(({ feature, raw }) => ({ feature, importance: raw / maxRaw }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 8);
  }, [clusterProfiles, featureNames]);

  const exportPdf = () => exportToPdf(
    "dashboard-results",
    `Clustering Report — ${result?.algorithm?.toUpperCase() ?? ""}`,
    "medicluster-clustering"
  );

  return (
    <Page
      title="Dashboard"
      className="mc-dashboard-page"
      sub="Configure a dataset and algorithm, run clustering, and inspect the resulting risk tiers."
      actions={hasResults && <button type="button" onClick={exportPdf} className="btn-secondary text-sm h-9">Export PDF</button>}
    >
      {error && (
        <div role="alert" className="flex justify-between gap-4 px-4 py-3 border border-risk-critical text-red-700 text-[13px]">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline shrink-0">Dismiss</button>
        </div>
      )}
      {warnings.length > 0 && (
        <div role="status" className="flex justify-between gap-4 px-4 py-3 border border-risk-moderate text-amber-800 text-[13px]">
          <div className="space-y-0.5">{warnings.map((w) => <p key={w}>{w}</p>)}</div>
          <button type="button" onClick={() => setWarnings([])} className="underline shrink-0">Dismiss</button>
        </div>
      )}

      <div className="mc-dashboard-grid mc-dashboard-paged">
        <div className="mc-dashboard-setup">
          <ScreenViews label="Clustering setup" value={setupView} onChange={setSetupView} views={[
            { id: "dataset", label: "Dataset", content: <UploadPanel onDatasetLoaded={handleDatasetLoaded} initialDataset={dataset} /> },
            { id: "algorithm", label: "Algorithm", content: <AlgorithmSelector onRun={handleRun} disabled={!dataset} dataset={dataset} /> },
          ]} />
        </div>
        <div id="dashboard-results" className="mc-dashboard-results-content mc-dashboard-panes">
          <ScreenViews label="Result views" value={String(activeTab)} onChange={value=>setActiveTab(Number(value))} views={[
            { id: "0", label: "Scatter", content: hasResults ? <div className="mc-result-chart"><ChartErrorBoundary title="Scatter plot" resetKey={`${runKey}-${result?.algorithm}-${activePatients.length}`}><ClusterScatterPlot patients={activePatients} featureNames={featureNames} onPatientClick={setSelectedPatient} /></ChartErrorBoundary></div> : <EmptyState /> },
            { id: "1", label: "Comparison", content: <ComparisonPanel allResults={allResults ?? {}} /> },
            { id: "2", label: "Dendrogram", content: <DendrogramView linkageMatrix={linkageMatrix} patients={activePatients} /> },
            { id: "3", label: "Anomalies", content: hasResults ? <AnomalyWatchlist patients={activePatients} anomalies={anomalies} featureNames={featureNames} onPatientClick={setSelectedPatient} /> : <EmptyState /> },
            { id: "4", label: "Risk & quality", content: <div className="mc-result-quality"><RiskBars riskDistribution={activeRiskDist} /><MetricsPanel metrics={activeMetrics} /></div> },
            { id: "5", label: "Clusters", content: clusterProfiles.length ? <ClusterTable profiles={clusterProfiles} /> : <EmptyState /> },
            { id: "6", label: "Patients", content: <PatientTable patients={activePatients} /> },
            { id: "7", label: "AI insights", content: result ? <AIClusterInsights result={result} /> : <EmptyState /> },
            { id: "8", label: "Drivers", content: <div className="mc-fit-card"><h2>Feature drivers</h2><p className="text-xs text-slate-500">What drives cluster separation</p>{featureImportance.length ? featureImportance.map(({feature,importance})=><div key={feature} className="space-y-1"><div className="flex justify-between text-xs"><span>{feature}</span><span>{Math.round(importance*100)}%</span></div><div className="h-1.5 bg-sunken"><div className="h-full bg-ink" style={{width:`${importance*100}%`}} /></div></div>):<p className="text-sm text-slate-500">Run clustering to inspect feature drivers.</p>}</div> },
            { id: "9", label: "SHAP", content: <div className="mc-fit-card"><div className="flex items-center justify-between gap-3"><h2>SHAP explainability</h2><button type="button" className="btn-secondary text-xs" onClick={loadShap} disabled={!activePatients.length||shapLoading}>{shapLoading?"Computing…":"Load"}</button></div>{!shapData&&!shapLoading&&<p className="text-sm text-slate-500">Load feature attributions for the current clustering result.</p>}{Object.entries(shapData?.feature_importances||{}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([feature,value])=><div className="flex justify-between text-sm" key={feature}><span>{feature}</span><span className="font-mono">{value.toFixed(3)}</span></div>)}</div> },
          ]} />
        </div>
      </div>

      {selectedPatient && (
        <PatientDetailModal
          patient={selectedPatient}
          clusterProfiles={clusterProfiles}
          featureNames={featureNames}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </Page>
  );
}

const CLUSTER_COLS = [
  { key: "age", label: "Age" },
  { key: "systolic_bp", label: "SBP" },
  { key: "glucose", label: "Glucose" },
];

// Per-cluster size and centroid vitals, ordered by cluster id.
function ClusterTable({ profiles }) {
  const [host, size] = usePageCapacity({rowHeight: 46, reserved: 70, max: 10});
  const [page, setPage] = useState(0);
  const rows = [...profiles].sort((a, b) => a.cluster_id - b.cluster_id);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div ref={host} className="mc-fit-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="eyebrow text-left border-b border-ink">
            <th className="py-2 font-normal">Cl.</th>
            <th className="py-2 font-normal text-right">N</th>
            {CLUSTER_COLS.map((c) => <th key={c.key} className="py-2 font-normal text-right">{c.label}</th>)}
            <th className="py-2 font-normal text-right">Tier</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(currentPage*size,(currentPage+1)*size).map((cp) => (
            <tr key={cp.cluster_id} className="border-b border-line">
              <td className="py-3 font-mono">C{cp.cluster_id}</td>
              <td className="py-3 font-mono text-right">{cp.size}</td>
              {CLUSTER_COLS.map((c) => {
                const v = cp.centroid_features?.[c.key];
                return <td key={c.key} className="py-3 font-mono text-right">{v == null ? "—" : Math.round(v)}</td>;
              })}
              <td className="py-3 text-right"><Tag tone={cp.risk_tier} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={currentPage} pages={pages} onChange={setPage} label="Cluster summaries" />
    </div>
  );
}

function collectWarnings(response) {
  const all = new Set(response?.warnings ?? []);
  for (const r of Object.values(response?.all ?? {}))
    for (const w of r?.warnings ?? []) all.add(w);
  return [...all];
}
