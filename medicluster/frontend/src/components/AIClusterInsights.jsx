import { useMemo, useState } from "react";
import { DashboardInsightPages } from "./DashboardInsightPages";
import { generateClusterInsights } from "../api/apiClient";

function riskDistribution(result) {
  return result?.riskDistribution ?? result?.risk_distribution ?? {};
}

function clusterProfiles(result) {
  return result?.clusterProfiles ?? result?.cluster_profiles ?? [];
}

function featureNames(result) {
  return result?.featureNames ?? result?.feature_names ?? [];
}

function compactResult(result) {
  const patients = (result?.patients ?? []).map((patient) => ({
    patient_id: patient.patient_id,
    risk_tier: patient.risk_tier,
    cluster_id: patient.cluster_id,
    age: patient.age,
    bmi: patient.bmi,
    systolic_bp: patient.systolic_bp,
    diastolic_bp: patient.diastolic_bp,
    glucose: patient.glucose,
    hba1c: patient.hba1c,
    cholesterol: patient.cholesterol,
    ldl: patient.ldl,
    triglycerides: patient.triglycerides,
    spo2: patient.spo2,
    num_medications: patient.num_medications,
  }));

  return {
    algorithm: result?.algorithm,
    metrics: result?.metrics,
    riskDistribution: riskDistribution(result),
    clusterProfiles: clusterProfiles(result),
    featureNames: featureNames(result),
    warnings: result?.warnings ?? [],
    patients,
  };
}

function SourcePill({ source }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${ source === "ai" ? "bg-sunken text-ink border-line-strong" : "bg-slate-50 text-slate-500 border-line" }`}>
      {source === "ai" ? "AI" : "Local"}
    </span>
  );
}

export default function AIClusterInsights({ result }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const payload = useMemo(() => compactResult(result), [result]);
  const canGenerate = (payload.patients?.length ?? 0) > 0 || (payload.clusterProfiles?.length ?? 0) > 0;

  async function handleGenerate() {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generateClusterInsights(payload);
      setInsights(data);
    } catch (err) {
      setError(err?.response?.data?.error || "AI insights unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mc-dashboard-insights panel fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <p className="section-label mb-0">AI Cohort Copilot</p>
            {insights?.source && <SourcePill source={insights.source} />}
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || loading}
          className="btn-primary text-xs py-1.5 px-3 shrink-0 disabled:opacity-40"
        >
          {loading ? (
            <><div className="spinner w-3 h-3" />Thinking...</>
          ) : insights ? (
            "Refresh"
          ) : (
            "Generate insights"
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 bg-surface border border-red-200 rounded-[3px] px-3 py-2">{error}</p>
      )}

      {!insights && !loading && !error && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            ["Risk drivers", "Feature patterns behind cluster separation"],
            ["Care actions", "Follow-up priorities by cluster"],
            ["Watchlist", "High-acuity patients to review first"],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-[3px] border border-line bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold text-slate-700">{title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{copy}</p>
            </div>
          ))}
        </div>
      )}

      {insights && <DashboardInsightPages insights={insights} />}

    </section>
  );
}
