import { useEffect, useId, useState } from "react";
import "./viewport-ui.css";

export function ScreenViews({ views, label = "Page views", value, onChange, initial, primaryIds }) {
  const choices = views.filter(Boolean);
  const [local, setLocal] = useState(initial || choices[0]?.id);
  const selected = choices.some(view => view.id === (value ?? local)) ? (value ?? local) : choices[0]?.id;
  const id = useId();
  const choose = next => { setLocal(next); onChange?.(next); };
  const primary = primaryIds ? primaryIds.map(key => choices.find(view => view.id === key)).filter(Boolean) : choices;
  const secondary = primaryIds ? choices.filter(view => !primaryIds.includes(view.id)) : [];
  return <div className="mc-screen-views">
    <div className={primaryIds ? "mc-view-controls" : "contents"}>
    <div className="mc-screen-view-tabs" role="tablist" aria-label={label} onKeyDown={event => {
      const index = primary.findIndex(view => view.id === selected);
      const next = event.key === "ArrowRight" ? (index + 1) % primary.length : event.key === "ArrowLeft" ? (index + primary.length - 1) % primary.length : event.key === "Home" ? 0 : event.key === "End" ? primary.length - 1 : null;
      if (next !== null) { event.preventDefault(); choose(primary[next].id); document.getElementById(`${id}-${primary[next].id}`)?.focus(); }
    }}>
      {primary.map(view => <button key={view.id} type="button" id={`${id}-${view.id}`} role="tab" aria-selected={selected === view.id} aria-controls={`${id}-${view.id}-panel`} tabIndex={selected === view.id || (!primary.some(item => item.id === selected) && view === primary[0]) ? 0 : -1} onClick={() => choose(view.id)}>{view.label}</button>)}
    </div>
    {secondary.length > 0 && <label className="mc-view-more"><span className="sr-only">More result views</span><select aria-label="More result views" value={secondary.some(view => view.id === selected) ? selected : ""} onChange={event => choose(event.target.value)}><option value="" disabled>More</option>{secondary.map(view => <option key={view.id} id={`${id}-${view.id}`} value={view.id}>{view.label}</option>)}</select></label>}
    </div>
    <label className="mc-screen-view-select"><span className="sr-only">{label}</span><select value={selected} onChange={event => choose(event.target.value)}>{choices.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}</select></label>
    {choices.map(view => <div key={view.id} className="mc-view-panel" id={`${id}-${view.id}-panel`} role="tabpanel" aria-labelledby={`${id}-${view.id}`} hidden={selected !== view.id}>{view.content}</div>)}
  </div>;
}

export function Pager({ page, pages, onChange, label = "Results pages" }) {
  return <nav className="mc-pagination" aria-label={label}>
    <button type="button" disabled={page <= 0} onClick={() => onChange(page - 1)}>Previous</button>
    <span aria-live="polite">{page + 1} / {Math.max(1, pages)}</span>
    <button type="button" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>Next</button>
  </nav>;
}

export function usePageCapacity({ rowHeight = 44, reserved = 90, max = 12 } = {}) {
  const [node, setNode] = useState(null);
  const [size, setSize] = useState(4);
  useEffect(() => {
    if (!node) return;
    const measure = () => { const height = node.clientHeight; if (height > 0) setSize(Math.max(1, Math.min(max, Math.floor((height - reserved) / rowHeight)))); };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [node, rowHeight, reserved, max]);
  return [setNode, size];
}
