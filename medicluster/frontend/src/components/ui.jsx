import { useLocation } from "react-router-dom";
import { NAV_ITEMS, isActive } from "../navigation";

// Shared cards, page headings, clinical tags and controls.

export function PageHeader({ title, sub }) {
  const { pathname } = useLocation();
  const item = NAV_ITEMS.find((i) => i.to && isActive(i.to, pathname));
  return (
    <header className="mc-page-heading flex flex-col gap-2 max-w-[720px]">
      {item && (
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-slate-500">{item.num} — {item.group}</span>
      )}
      <h1 className="font-serif font-normal text-[clamp(30px,6vw,40px)] leading-[1.05] tracking-[-0.02em]">{title}</h1>
      {sub && <p className="text-slate-600 text-[15px] leading-normal">{sub}</p>}
    </header>
  );
}

export function Page({ title, sub, actions, children, className = "" }) {
  return (
    <div className={`mc-workspace-page px-4 min-[860px]:px-10 pt-5 min-[860px]:pt-9 pb-16 flex flex-col gap-8 min-w-0 ${className}`}>
      <div className="mc-workspace-page-header flex flex-wrap items-end justify-between gap-4">
        <PageHeader title={title} sub={sub} />
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      <div className="mc-workspace-page-content">{children}</div>
    </div>
  );
}

export function Section({ title, aside, children, className = "" }) {
  return (
    <section className={`mc-section-card flex flex-col min-w-0 ${className}`}>
      <div className="mc-section-heading flex justify-between items-baseline gap-3">
        <h2 className="font-sans text-[13px] font-semibold tracking-normal">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const TAG_TONES = {
  low:      "border-risk-low text-green-700",
  normal:   "border-risk-low text-green-700",
  moderate: "border-risk-moderate text-amber-700",
  warning:  "border-risk-moderate text-amber-700",
  medium:   "border-risk-moderate text-amber-700",
  high:     "border-risk-high text-orange-700",
  major:    "border-risk-critical text-red-700",
  critical: "border-risk-critical text-red-700",
  noise:    "border-slate-400 text-slate-500",
};

export function Tag({ tone, children, className = "" }) {
  const cls = TAG_TONES[String(tone || "").toLowerCase()] || "border-line-strong text-slate-600";
  return (
    <span className={`inline-block font-mono text-[11px] tracking-[0.04em] uppercase px-1.5 border rounded-sm leading-4 whitespace-nowrap ${cls} ${className}`}>
      {children ?? tone}
    </span>
  );
}

export function Segmented({ options, value, onChange, label, mono = false, fullWidth = false }) {
  return (
    <div role="tablist" aria-label={label} data-card-control="segments"
      className={`flex border border-line-strong rounded-[3px] overflow-hidden ${fullWidth ? "w-full" : "w-fit"}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={`${fullWidth ? "flex-1" : ""} h-8 px-3 whitespace-nowrap ${i ? "border-l border-line-strong" : ""} ${
              mono ? "font-mono text-[11px] tracking-[0.04em] uppercase" : "text-[13px]"
            } ${on ? "bg-ink text-paper" : "text-slate-600 hover:bg-sunken"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Underlined tab strip used above charts and tools.
export function Tabs({ options, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} data-card-control="tabs" className="flex gap-5 border-b border-line overflow-x-auto">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={`pb-2.5 -mb-px text-[13.5px] whitespace-nowrap border-b-2 ${on ? "border-ink text-ink font-medium" : "border-transparent text-slate-500 hover:text-ink"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function KV({ k, v, mono = true }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-line text-[13px]">
      <span className="text-slate-600">{k}</span>
      <span className={mono ? "font-mono" : ""}>{v}</span>
    </div>
  );
}

export const linkCls = "text-blue-600 underline underline-offset-2 hover:text-ink";
