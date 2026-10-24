import { useState, useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { RISK_COLORS } from "../theme";

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const features = Object.keys(d).filter(
    (k) => !["pca_x", "pca_y", "cluster_id", "risk_tier", "patient_id", "gmm_probabilities"].includes(k)
  );
  const top3 = features.slice(0, 3);

  return (
    <div className="bg-surface border border-line-strong rounded-[3px] p-3 text-xs">
      <p className="font-mono text-blue-700 mb-1">{d.patient_id}</p>
      <p className="mb-1">
        Risk:{" "}
        <span style={{ color: RISK_COLORS[d.risk_tier] ?? "#fff" }} className="font-semibold">
          {d.risk_tier}
        </span>
        <span className="text-slate-500 ml-1">(Cluster {d.cluster_id})</span>
      </p>
      {top3.map((k) => (
        <p key={k} className="text-slate-400">
          <span className="font-mono text-slate-500">{k}:</span>{" "}
          {typeof d[k] === "number" ? d[k].toFixed(2) : d[k]}
        </p>
      ))}
    </div>
  );
}

export default function ClusterScatterPlot({ patients = [], featureNames = [], onPatientClick }) {
  const [xAxis, setXAxis] = useState("pca_x");
  const [yAxis, setYAxis] = useState("pca_y");

  const axisOptions = useMemo(() => {
    const pca = ["pca_x", "pca_y"];
    return [...pca, ...featureNames];
  }, [featureNames]);

  // Group patients by risk tier for Recharts <Scatter> series
  const seriesData = useMemo(() => {
    const groups = {};
    for (const p of patients) {
      const tier = p.risk_tier ?? "Unknown";
      if (!groups[tier]) groups[tier] = [];
      groups[tier].push({
        ...p,
        x: p[xAxis] ?? 0,
        y: p[yAxis] ?? 0,
      });
    }
    return groups;
  }, [patients, xAxis, yAxis]);

  const isEmpty = patients.length === 0;

  return (
    <div className="panel h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="section-label mb-0">Cluster Scatter Plot</p>
        <div className="flex gap-2 items-center">
          <AxisSelect label="X" value={xAxis} options={axisOptions} onChange={setXAxis} />
          <AxisSelect label="Y" value={yAxis} options={axisOptions} onChange={setYAxis} />
        </div>
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height="100%" minHeight={380}>
          <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#d7dacf" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              name={xAxis}
              tick={{ fill: "#62675e", fontSize: 11, fontFamily: "IBM Plex Mono" }}
              label={{ value: xAxis, fill: "#62675e", fontSize: 10, position: "insideBottom", offset: -2 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              name={yAxis}
              tick={{ fill: "#62675e", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            />
            <ZAxis range={[30, 30]} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#ad633f22" }} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(val) => <span style={{ color: RISK_COLORS[val] }}>{val}</span>}
            />
            {Object.entries(seriesData).map(([tier, data]) => (
              <Scatter
                key={tier}
                name={tier}
                data={data}
                fill={RISK_COLORS[tier] ?? "#888"}
                fillOpacity={tier === "Noise" ? 0.4 : 0.85}
                shape={tier === "Noise" ? "cross" : "circle"}
                onClick={(point) => onPatientClick?.(point)}
                style={{ cursor: onPatientClick ? "pointer" : "default" }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function AxisSelect({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-surface border border-line-strong rounded px-2 py-1 text-slate-700 font-mono focus:outline-none focus:border-ink"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-2">
      <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
        <circle cx="14" cy="18" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="30" cy="14" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="20" cy="32" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="34" cy="28" r="3" fill="currentColor" opacity="0.5" />
      </svg>
      <p className="text-sm">Run clustering to see scatter plot</p>
    </div>
  );
}
