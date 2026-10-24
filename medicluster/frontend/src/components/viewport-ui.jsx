import { useEffect, useId, useRef, useState } from "react";
import "./viewport-ui.css";

export function ScreenViews({ views, label = "Page views", value, onChange, initial }) {
  const choices = views.filter(Boolean);
  const [local, setLocal] = useState(initial || choices[0]?.id);
  const selected = choices.some(view => view.id === (value ?? local)) ? (value ?? local) : choices[0]?.id;
  const id = useId();
  const choose = next => { setLocal(next); onChange?.(next); };
  return <div className="mc-screen-views">
    <div className="mc-screen-view-tabs" role="tablist" aria-label={label} onKeyDown={event => {
      const index = choices.findIndex(view => view.id === selected);
      const next = event.key === "ArrowRight" ? (index + 1) % choices.length : event.key === "ArrowLeft" ? (index + choices.length - 1) % choices.length : event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : null;
      if (next !== null) { event.preventDefault(); choose(choices[next].id); document.getElementById(`${id}-${choices[next].id}`)?.focus(); }
    }}>
      {choices.map(view => <button key={view.id} type="button" id={`${id}-${view.id}`} role="tab" aria-selected={selected === view.id} aria-controls={`${id}-${view.id}-panel`} tabIndex={selected === view.id ? 0 : -1} onClick={() => choose(view.id)}>{view.label}</button>)}
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
  const ref = useRef(null);
  const [size, setSize] = useState(4);
  useEffect(() => {
    if (!ref.current) return;
    const measure = () => { const height = ref.current?.clientHeight || 0; if (height > reserved) setSize(Math.max(1, Math.min(max, Math.floor((height - reserved) / rowHeight)))); };
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    measure();
    return () => observer.disconnect();
  }, [rowHeight, reserved, max]);
  return [ref, size];
}
