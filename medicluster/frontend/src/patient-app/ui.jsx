import React from "react";
import { Link } from "react-router-dom";

/** Scrollable content area between the header and the tab bar / footer. */
export function Body({ className = "", children }) {
  return <div className={`mc-patient-screen flex-1 overflow-y-auto ${className}`}>{children}</div>;
}

/** Modal-style top bar: left action, centred title, spacer. */
export function TopBar({ back, backLabel = "‹ Back", title }) {
  return (
    <div className="mc-patient-topbar shrink-0 flex justify-between items-center px-[22px] py-3 text-[15px]">
      <Link to={back} className="text-blue-600 w-16">{backLabel}</Link>
      <span className="font-semibold">{title}</span>
      <span className="w-16" />
    </div>
  );
}

/** List heading with a strong rule underneath. */
export function ListHeader({ title, meta }) {
  return (
    <div className="mc-patient-list-heading flex justify-between text-[13px] font-semibold">
      <span>{title}</span>
      {meta && <span className="font-mono font-normal text-slate-500">{meta}</span>}
    </div>
  );
}

export function Eyebrow({ children, className = "" }) {
  return (
    <span className={`font-mono text-[10px] tracking-[0.08em] text-slate-500 ${className}`}>{children}</span>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="px-3.5 py-3 border border-red-300 bg-red-50 rounded text-[13px] text-red-700">
      {children}
    </div>
  );
}

export function initials(name) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : parts[0][1] ?? "")).toUpperCase();
}
