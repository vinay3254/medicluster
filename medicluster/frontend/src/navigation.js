// VITE_DISPATCH_URL can override the deployed dispatch and crew workspace.
export const DISPATCH_URL = import.meta.env.VITE_DISPATCH_URL || (
  import.meta.env.DEV
    ? "http://localhost:5174"
    : "http://localhost:5175"
);

// Clinician app sections, in sidebar order. Numbers ("01", "02", …) follow this order.
export const NAV_GROUPS = [
  { label: "Overview", items: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/alerts",    label: "Alerts" },
  ] },
  { label: "Analyze", items: [
    { to: "/imaging",  label: "Imaging" },
    { to: "/brain-explorer", label: "3D Tumor Explorer" },
    { to: "/deterioration-radar", label: "Deterioration Radar" },
    { to: "/ml-tools", label: "ML Tools" },
  ] },
  { label: "Patients", items: [
    { to: "/patient",   label: "Patients" },
    { to: "/reminders", label: "Reminders" },
    { to: "/reports",   label: "Reports" },
  ] },
  { label: "AI", items: [
    { to: "/ask-ai",      label: "CliniQ" },
    { to: "/clinical-ai", label: "Clinical AI" },
  ] },
  { label: "Operations", items: [
    { to: "/hospitals", label: "Hospitals" },
    { href: DISPATCH_URL, label: "Dispatch" },
  ] },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ ...item, group: g.label }))
).map((item, i) => ({ ...item, num: String(i + 1).padStart(2, "0") }));

export function isActive(to, pathname) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}
