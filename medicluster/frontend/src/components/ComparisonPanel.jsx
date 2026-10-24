import React, { useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const ALGOS = ["kmeans", "dbscan", "hierarchical", "gmm"];
const ALGO_LABELS = { kmeans: "K-Means", dbscan: "DBSCAN", hierarchical: "Hierarchical", gmm: "GMM" };
import { RISK_COLORS } from "../theme";

const METRIC_KEYS = ["silhouette", "davies_bouldin", "calinski_harabasz"];
const METRIC_LABELS = {
  silhouette: "Silhouette ↑",
  davies_bouldin: "Davies-Bouldin ↓",
  calinski_harabasz: "Calinski-H ↑",
};

export default function ComparisonPanel({ allResults }) {
  const isEmpty = !allResults || Object.keys(allResults).length === 0;

  // Find best algorithm per metric
  const bestAlgos = useMemo(() => {
    if (isEmpty) return {};
    const best = {};
    for (const mk of METRIC_KEYS) {
      let bestAlgo = null, bestVal = null;
      for (const [algo, res] of Object.entries(allResults)) {
        if (res.error) continue;
        const v = res.metrics?.[mk];
        if (v === null || v === undefined) continue;
        const better = mk === "davies_bouldin"
          ? bestVal === null || v < bestVal
          : bestVal === null || v > bestVal;
        if (better) { bestVal = v; bestAlgo = algo; }
      }
      best[mk] = bestAlgo;
    }
    return best;
  }, [allResults, isEmpty]);

  if (isEmpty) {
    return (
      <div className="panel flex items-center justify-center h-64 text-slate-600 text-sm">
        Run <span className="mx-1 text-blue-600 font-mono">All</span> algorithms to see comparison
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in">
      {/* Metrics comparison table */}
      <div className="panel">
        <p className="section-label mb-3">Algorithm Comparison — Quality Metrics</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wide border-b border-navy-700">
                <th className="py-2 pr-4">Algorithm</th>
                {METRIC_KEYS.map((mk) => (
                  <th key={mk} className="py-2 px-3">{METRIC_LABELS[mk]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALGOS.map((algo) => {
                const res = allResults[algo];
                const hasErr = !res || res.error;
                return (
                  <tr key={algo} className="border-t border-navy-700/60 hover:bg-navy-700/30">
                    <td className="py-2 pr-4 font-semibold text-slate-800">{ALGO_LABELS[algo]}</td>
                    {METRIC_KEYS.map((mk) => {
                      const v = res?.metrics?.[mk];
                      const isBest = bestAlgos[mk] === algo;
                      return (
                        <td key={mk} className={`py-2 px-3 font-mono ${isBest ? "text-blue-700 font-semibold" : "text-slate-500"}`}>
                          {hasErr ? <span className="text-blue-800 text-xs">{res?.error ?? "Error"}</span>
                            : v !== null && v !== undefined ? (
                              <>
                                {v.toFixed(3)}
                                {isBest && <span className="ml-1.5 font-mono text-[10px] uppercase text-green-700">best</span>}
                              </>
                            ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2×2 mini scatter plots */}
      <div className="grid grid-cols-2 gap-3">
        {ALGOS.map((algo) => {
          const res = allResults[algo];
          const pts = res?.patients ?? [];
          const series = {};
          for (const p of pts) {
            const t = p.risk_tier ?? "Unknown";
            if (!series[t]) series[t] = [];
            series[t].push({ x: p.pca_x, y: p.pca_y });
          }

          return (
            <div key={algo} className="panel">
              <p className="text-xs font-semibold text-slate-800 mb-2">{ALGO_LABELS[algo]}</p>
              {res?.error ? (
                <div className="text-blue-800 text-xs p-4">{res.error}</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <ScatterChart margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid stroke="#d7dacf" strokeDasharray="2 2" />
                    <XAxis dataKey="x" type="number" tick={{ fontSize: 9, fill: "#45484d" }} />
                    <YAxis dataKey="y" type="number" tick={{ fontSize: 9, fill: "#45484d" }} />
                    <ZAxis range={[15, 15]} />
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="bg-surface border border-line-strong rounded px-2 py-1 text-xs text-slate-700">
                            {payload[0].payload.x?.toFixed(2)}, {payload[0].payload.y?.toFixed(2)}
                          </div>
                        ) : null
                      }
                    />
                    {Object.entries(series).map(([tier, data]) => (
                      <Scatter
                        key={tier}
                        name={tier}
                        data={data}
                        fill={RISK_COLORS[tier] ?? "#888"}
                        fillOpacity={0.75}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
              {/* Mini risk dist */}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {Object.entries(res?.risk_distribution ?? {}).map(([t, c]) => (
                  <span key={t} className="text-xs font-mono" style={{ color: RISK_COLORS[t] }}>
                    {t[0]}: {c}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
