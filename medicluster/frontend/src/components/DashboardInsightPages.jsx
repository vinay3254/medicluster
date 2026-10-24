import { useLayoutEffect, useRef, useState } from "react";
import { Pager } from "./viewport-ui";

// Measure rendered copy so long AI responses remain reachable without scrolling.
export function DashboardInsightPages({ insights }) {
  const [view, setView] = useState("Summary");
  const sections = {
    Summary: [insights.headline, insights.cohort_summary, ...(insights.care_pathways ?? []), insights.safety_note].filter(Boolean).join("\n\n"),
    "Risk drivers": (insights.risk_drivers ?? []).map(item => `${item.feature}\n${item.signal}\n${item.rationale}`).join("\n\n"),
    "Care actions": (insights.cluster_actions ?? []).map(item => `Cluster ${item.cluster_id ?? "—"} · ${item.priority}\n${item.action}`).join("\n\n"),
    Watchlist: (insights.patient_watchlist ?? []).map(item => `${item.patient_id} · ${item.risk_tier}\n${item.reason}`).join("\n\n"),
  };
  const text = sections[view] || "No additional details returned.";
  const viewport = useRef(null);
  const probe = useRef(null);
  const [pages, setPages] = useState([text]);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const box = viewport.current;
      if (!box?.clientHeight || !box.clientWidth) return;
      probe.current.style.width = `${box.clientWidth}px`;
      const next = [];
      let rest = text;
      while (rest.length) {
        let low = 1, high = rest.length, fit = 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          probe.current.textContent = rest.slice(0, mid);
          if (probe.current.offsetHeight <= box.clientHeight - 2) { fit = mid; low = mid + 1; }
          else high = mid - 1;
        }
        const boundary = rest.lastIndexOf(" ", fit);
        if (fit < rest.length && boundary > fit * .7) fit = boundary + 1;
        next.push(rest.slice(0, fit));
        rest = rest.slice(fit);
      }
      setPages(next);
      setPage(current => Math.min(current, next.length - 1));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current);
    measure();
    document.fonts?.ready.then(measure);
    setPage(0);
    return () => observer.disconnect();
  }, [text]);
  return <div className="mc-insight-pages">
    <label>Insight section<select value={view} onChange={event => setView(event.target.value)}>{Object.keys(sections).map(section => <option key={section}>{section}</option>)}</select></label>
    <div ref={viewport} className="mc-insight-viewport"><p className="mc-insight-text" aria-live="polite">{pages[Math.min(page, pages.length - 1)]}</p></div>
    <p ref={probe} className="mc-insight-text mc-insight-probe" aria-hidden="true" />
    <Pager page={Math.min(page, pages.length - 1)} pages={pages.length} onChange={setPage} label="Insight pages" />
  </div>;
}
