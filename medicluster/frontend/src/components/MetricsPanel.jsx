import { Section } from "./ui";

const METRIC_CONFIG = {
  silhouette: {
    label: "Silhouette Score",
    short: "Silhouette",
    unit: "",
    min: -1,
    max: 1,
    higherBetter: true,
    interpret: (v) =>
      v === null ? "N/A"
      : v > 0.7  ? "Excellent clustering"
      : v > 0.5  ? "Reasonable structure"
      : v > 0.25 ? "Weak clustering"
      : "Overlapping clusters",
    color: (v) =>
      v === null ? "#62675e"
      : v > 0.5  ? "#1d39a3"
      : v > 0.25 ? "#5f78d4"
      : "#a19c92",
  },
  davies_bouldin: {
    label: "Davies-Bouldin Index",
    short: "Davies-Bouldin",
    unit: "",
    min: 0,
    max: 3,
    higherBetter: false,
    interpret: (v) =>
      v === null ? "N/A"
      : v < 0.5  ? "Excellent separation"
      : v < 1.0  ? "Good separation"
      : v < 2.0  ? "Moderate overlap"
      : "Poor separation",
    color: (v) =>
      v === null ? "#62675e"
      : v < 0.5  ? "#1d39a3"
      : v < 1.0  ? "#5f78d4"
      : "#a19c92",
  },
  calinski_harabasz: {
    label: "Calinski-Harabasz",
    short: "Calinski-Harabasz",
    unit: "",
    min: 0,
    max: null,  // unbounded
    higherBetter: true,
    interpret: (v) =>
      v === null ? "N/A"
      : v > 500   ? "Very dense, well-separated clusters"
      : v > 200   ? "Good cluster structure"
      : v > 50    ? "Moderate structure"
      : "Diffuse clusters",
    color: (v) =>
      v === null ? "#62675e"
      : v > 200   ? "#1d39a3"
      : v > 50    ? "#5f78d4"
      : "#a19c92",
  },
};

const HINTS = {
  silhouette: "Higher is better, −1 to 1",
  davies_bouldin: "Lower is better",
  calinski_harabasz: "Higher is better",
};

export default function MetricsPanel({ metrics = {} }) {
  return (
    <Section title="Cluster quality">
      {Object.entries(METRIC_CONFIG).map(([key, cfg]) => {
        const raw = metrics[key] ?? null;
        const display = raw === null ? "—"
          : key === "calinski_harabasz" ? Math.round(raw).toLocaleString() : raw.toFixed(2);
        return (
          <div key={key} className="flex justify-between items-start gap-3 py-3 border-b border-line"
            title={cfg.interpret(raw)}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px]">{cfg.short}</span>
              <span className="text-xs text-slate-500">{HINTS[key]}</span>
            </div>
            <span className="font-mono text-[17px]">{display}</span>
          </div>
        );
      })}
    </Section>
  );
}
