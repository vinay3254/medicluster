import React, { useState } from "react";
import { Section } from "./ui";
import { getOptimalK } from "../api/apiClient";

const ALGORITHMS = [
  { id: "kmeans",       label: "K-Means" },
  { id: "dbscan",       label: "DBSCAN" },
  { id: "hierarchical", label: "Hierarchical" },
  { id: "gmm",          label: "GMM" },
  { id: "all",          label: "Compare all" },
];

const DEFAULT_PARAMS = {
  kmeans:       { k: 4, init: "k-means++" },
  dbscan:       { eps: 0.5, min_samples: 5 },
  hierarchical: { n_clusters: 4, linkage: "ward" },
  gmm:          { n_components: 4, covariance_type: "full" },
  all:          {},
};

export default function AlgorithmSelector({ onRun, disabled, dataset }) {
  const [selected,    setSelected]    = useState("kmeans");
  const [params,      setParams]      = useState(DEFAULT_PARAMS);
  const [loading,     setLoading]     = useState(false);
  const [recLoading,  setRecLoading]  = useState(false);
  const [recResult,   setRecResult]   = useState(null); // { best_k, scores }

  const set = (key, val) =>
    setParams((p) => ({ ...p, [selected]: { ...p[selected], [key]: val } }));

  const handleRun = async () => {
    setLoading(true);
    try {
      await onRun?.(selected, params[selected] ?? {});
    } finally {
      setLoading(false);
    }
  };

  const handleRecommendK = async () => {
    if (!dataset) return;
    setRecLoading(true);
    setRecResult(null);
    try {
      const rows = dataset.datasetId === "__sample__" ? dataset.rawData : dataset.preview;
      const data = await getOptimalK(rows);
      const bestK = data.best_k ?? data.optimal_k ?? data.recommended_k;
      if (bestK) {
        setRecResult(data);
        // Auto-apply K to the active param
        if (selected === "kmeans")       set("k", bestK);
        else if (selected === "gmm")     set("n_components", bestK);
        else if (selected === "hierarchical") set("n_clusters", bestK);
      }
    } catch {
      // silently ignore — button just won't show a result
    } finally {
      setRecLoading(false);
    }
  };

  const showRecommendBtn = (selected === "kmeans" || selected === "gmm" || selected === "hierarchical") && !disabled;

  return (
    <Section title="Algorithm" className="mc-algorithm-card">
      <div className="mc-algorithm-content">
      <div role="radiogroup" aria-label="Algorithm" className="mc-algorithm-options flex flex-col pt-1">
        {ALGORITHMS.map((algo) => {
          const on = selected === algo.id;
          return (
            <button key={algo.id} type="button" role="radio" aria-checked={on} onClick={() => setSelected(algo.id)}
              className={`flex justify-between items-center py-2 border-b border-line text-[13px] text-left ${on ? "text-ink font-medium" : "text-slate-600 hover:text-ink"}`}>
              {algo.label}<span aria-hidden="true">{on ? "●" : ""}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic parameter controls */}
      <div className="mc-algorithm-parameters flex flex-col gap-4 pt-4 text-sm">
        {selected === "kmeans" && (
          <>
            <SliderField
              label="K (clusters)"
              min={2} max={8} step={1}
              value={params.kmeans.k}
              onChange={(v) => set("k", +v)}
            />
            <SelectField
              label="Init method"
              options={["k-means++", "random"]}
              value={params.kmeans.init}
              onChange={(v) => set("init", v)}
            />
          </>
        )}

        {selected === "dbscan" && (
          <>
            <SliderField
              label="Epsilon"
              min={0.1} max={2.0} step={0.1}
              value={params.dbscan.eps}
              onChange={(v) => set("eps", +v)}
            />
            <SliderField
              label="Min Samples"
              min={2} max={20} step={1}
              value={params.dbscan.min_samples}
              onChange={(v) => set("min_samples", +v)}
            />
          </>
        )}

        {selected === "hierarchical" && (
          <>
            <SliderField
              label="Clusters"
              min={2} max={8} step={1}
              value={params.hierarchical.n_clusters}
              onChange={(v) => set("n_clusters", +v)}
            />
            <SelectField
              label="Linkage"
              options={["ward", "complete", "average", "single"]}
              value={params.hierarchical.linkage}
              onChange={(v) => set("linkage", v)}
            />
          </>
        )}

        {selected === "gmm" && (
          <>
            <SliderField
              label="Components"
              min={2} max={8} step={1}
              value={params.gmm.n_components}
              onChange={(v) => set("n_components", +v)}
            />
            <SelectField
              label="Covariance type"
              options={["full", "tied", "diag", "spherical"]}
              value={params.gmm.covariance_type}
              onChange={(v) => set("covariance_type", v)}
            />
          </>
        )}

        {selected === "all" && (
          <p className="text-xs text-slate-500 italic">
            Runs all 4 algorithms with default parameters for side-by-side comparison.
          </p>
        )}
      </div>

      {/* Recommend K */}
      {showRecommendBtn && (
        <div className="space-y-1">
          <button
            onClick={handleRecommendK}
            disabled={recLoading}
            className="btn-secondary w-full text-[13px] h-9 mt-3"
          >
            {recLoading ? (
              <><div className="spinner w-3 h-3" />Finding best K…</>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Recommend K
              </>
            )}
          </button>
          {recResult && (
            <div className="mt-2 py-2 border-b border-line text-xs space-y-1.5">
              <p>
                Recommended K = <span className="font-mono">{recResult.best_k ?? recResult.optimal_k}</span>
                <span className="text-slate-500 ml-1">(applied)</span>
              </p>
              {recResult.scores && (
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(recResult.scores).slice(0, 4).map(([k, v]) => (
                    <span key={k} className={`px-1.5 py-0.5 rounded font-mono ${String(k) === String(recResult.best_k ?? recResult.optimal_k) ? "bg-ink text-paper" : "text-slate-600 border border-line"}`}>
                      K={k}: {typeof v === "number" ? v.toFixed(3) : v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      </div>
      {/* Run button */}
      <button
        type="button"
        onClick={handleRun}
        disabled={disabled || loading}
        className="mc-cluster-run btn-primary w-full h-10 mt-5"
      >
        {loading ? (
          <>
            <div className="spinner w-4 h-4" />
            <span>Clustering…</span>
          </>
        ) : (
          "Run clustering"
        )}
      </button>
    </Section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SliderField({ label, min, max, step, value, onChange }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-xs text-slate-600">
        {label}<span className="font-mono text-ink">{value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(e.target.value)} className="w-full accent-ink cursor-pointer" />
      <span className="flex justify-between font-mono text-[11px] text-slate-500"><span>{min}</span><span>{max}</span></span>
    </label>
  );
}

function SelectField({ label, options, value, onChange }) {
  return (
    <label className="flex justify-between items-center gap-3 text-xs text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-mono text-[12px] text-ink border-0 border-b border-line-strong py-1 focus:outline-none focus:border-ink">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
