import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { flagReason as reason, loadLatestRuns as loadOverview, runId, runLabel, when } from "../data/clinical";
import { Section, Tag, linkCls } from "./ui";

const TIERS = [
  { name: "Low",      bar: "bg-risk-low" },
  { name: "Moderate", bar: "bg-risk-moderate" },
  { name: "High",     bar: "bg-risk-high" },
  { name: "Critical", bar: "bg-risk-critical" },
];

const criticalIds = (result) =>
  new Set((result?.patients || []).filter((p) => p.risk_tier === "Critical").map((p) => p.patient_id));

function Headline({ latest, prev }) {
  const dist = latest.riskDistribution || {};
  const total = Object.values(dist).reduce((a, b) => a + (b || 0), 0);
  const critical = dist.Critical || 0;
  let delta = "";
  if (prev) {
    const diff = critical - (prev.riskDistribution?.Critical || 0);
    delta = diff === 0 ? ` — same as ${runId(prev)}` : ` — ${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than ${runId(prev)}`;
  }

  return (
    <section className="mc-overview-summary flex flex-col gap-[18px]">
      <div className="flex justify-between gap-6 flex-wrap items-end">
        <p className="font-serif text-[30px] leading-[1.2] tracking-[-0.01em] max-w-[640px]">
          {critical.toLocaleString()} of {total.toLocaleString()} patients fall in the{" "}
          <span className="text-red-700">critical</span> tier{delta}.
        </p>
        <span className="font-mono text-xs text-slate-500">
          {runId(latest)} · {runLabel(latest)} · {when(latest.createdAt)}
        </span>
      </div>
      <TierBar dist={dist} total={total} />
    </section>
  );
}

function TierBar({ dist, total }) {
  const rows = TIERS.map((t) => {
    const n = dist[t.name] || 0;
    return { ...t, n, pct: total ? Math.round((n / total) * 100) : 0 };
  });
  // Every tier keeps room for its label, even at 0%.
  const flex = (pct) => ({ flex: `${Math.max(pct, 1)} 1 0`, minWidth: 76 });
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 h-7" role="img"
        aria-label={rows.map((r) => `${r.name} ${r.n} (${r.pct}%)`).join(", ")}>
        {rows.map((r) => <div key={r.name} className={r.bar} style={flex(r.pct)} />)}
      </div>
      <div className="flex gap-0.5 mt-[18px]">
        {rows.map((r) => (
          <div key={r.name} className="flex flex-col gap-0.5 whitespace-nowrap" style={flex(r.pct)}>
            <span className="text-xs text-slate-600">{r.name}</span>
            <span className="font-mono text-[15px]">
              {r.n.toLocaleString()}<span className="text-slate-500 text-xs"> · {r.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const rowCls = "grid gap-3.5 items-center py-3 border-b border-line text-[13px]";

function CriticalList({ latest, prev }) {
  const before = prev ? criticalIds(prev) : null;
  const rows = (latest.patients || [])
    .filter((p) => p.risk_tier === "Critical" && !before?.has(p.patient_id))
    .slice(0, 5);

  return (
    <Section
      title={before ? "Newly critical" : "Critical patients"}
      aside={<Link to="/patient" className={`text-xs ${linkCls}`}>All patients</Link>}
    >
      {rows.length === 0 && (
        <p className="py-3 text-[13px] text-slate-500">
          {before ? `No new critical patients since ${runId(prev)}.` : "No patients in the critical tier."}
        </p>
      )}
      {rows.map((p) => (
        <Link key={p.patient_id} to={`/patient/${encodeURIComponent(p.patient_id)}`}
          className={`${rowCls} grid-cols-[64px_minmax(0,1fr)_auto] hover:bg-sunken`}>
          <span className="font-mono text-slate-600 truncate">{p.patient_id}</span>
          <span>{reason(p)}</span>
          <Tag tone="critical" />
        </Link>
      ))}
    </Section>
  );
}

function RecentRuns({ runs }) {
  return (
    <Section title="Recent runs" aside={<span className="font-mono text-[11px] text-slate-500">SILHOUETTE</span>}>
      {runs.slice(0, 5).map((r) => (
        <Link key={r._id} to={`/results/${r._id}`}
          className={`${rowCls} grid-cols-[76px_minmax(0,1fr)_auto_44px] hover:bg-sunken`}>
          <span className="font-mono text-slate-600">{runId(r)}</span>
          <span className="min-w-0 break-words">{runLabel(r)}</span>
          <span className="text-slate-500">{when(r.createdAt)}</span>
          <span className="font-mono text-right">
            {typeof r.metrics?.silhouette === "number" ? r.metrics.silhouette.toFixed(2) : "—"}
          </span>
        </Link>
      ))}
    </Section>
  );
}

const STEPS = [
  { n: "1", title: "Upload vitals",     body: "Drop a CSV of patient vitals, or start with the sample dataset." },
  { n: "2", title: "Run clustering",    body: "K-Means, DBSCAN, Hierarchical or GMM — or compare all four." },
  { n: "3", title: "Review risk tiers", body: "Low to Critical, with cluster quality metrics and anomalies." },
];

function GettingStarted() {
  return (
    <section className="mc-section-card" aria-label="Getting started">
      <div className="mc-section-heading"><h2>From data to a clearer picture.</h2></div>
      <div className="mc-setup-steps">
        {STEPS.map(s => <div key={s.n} className="mc-setup-step"><span>{s.n}</span><div><h3>{s.title}</h3><p>{s.body}</p></div></div>)}
      </div>
    </section>
  );
}

export default function DashboardOverview() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadOverview()
      .then((data) => alive && setState({ status: "ready", ...data }))
      .catch((err) => alive && setState({
        status: "error",
        error: err?.response?.data?.error || "Couldn't load clustering results.",
      }));
    return () => { alive = false; };
  }, []);

  const { status, runs, latest, prev, error } = state;
  const hasRuns = status === "ready" && runs.length > 0;

  return (
    <section className="mc-dashboard-overview" aria-label="Population overview">

      {status === "loading" && <p className="text-sm text-slate-500" aria-busy="true">Loading latest run…</p>}
      {status === "error" && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {status === "ready" && !hasRuns && <GettingStarted />}
      {hasRuns && (
        <>
          <Headline latest={latest} prev={prev} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-10">
            <CriticalList latest={latest} prev={prev} />
            <RecentRuns runs={runs} />
          </div>
        </>
      )}
    </section>
  );
}
