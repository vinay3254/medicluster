import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ackAlerts, listAlerts } from "../api/apiClient";
import { Page, Segmented, Tag } from "../components/ui";
import "./alerts-page.css";

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
function dayGroup(iso) {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : "Earlier";
}

function Pager({ page, pages, onChange, label }) {
  return <nav className="alerts-pager" aria-label={label}>
    <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label={`Previous ${label}`}>Previous</button>
    <span aria-live="polite">{page + 1} / {pages}</span>
    <button type="button" disabled={page >= pages - 1} onClick={() => onChange(page + 1)} aria-label={`Next ${label}`}>Next</button>
  </nav>;
}

// Measure actual rendered text, so even long messages remain available as pages.
function TextPages({ text, resetKey }) {
  const viewport = useRef(null);
  const measure = useRef(null);
  const [pages, setPages] = useState([text]);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      const box = viewport.current;
      const probe = measure.current;
      if (!box || !probe || box.clientWidth < 1 || box.clientHeight < 1) return;
      probe.style.width = `${box.clientWidth}px`;
      const result = [];
      let rest = String(text || "No additional details.");
      while (rest.length) {
        let low = 1, high = rest.length, fit = 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          probe.textContent = rest.slice(0, mid);
          if (probe.offsetHeight <= box.clientHeight - 2) { fit = mid; low = mid + 1; }
          else high = mid - 1;
        }
        // Prefer a word boundary; long uninterrupted values can still be paged.
        const boundary = rest.lastIndexOf(" ", fit);
        if (fit < rest.length && boundary > fit * 0.7) fit = boundary + 1;
        result.push(rest.slice(0, fit));
        rest = rest.slice(fit);
      }
      setPages(result);
      setPage((p) => Math.min(p, result.length - 1));
    };
    const observer = new ResizeObserver(update);
    observer.observe(viewport.current);
    update();
    document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, [text]);
  useEffect(() => setPage(0), [resetKey, text]);
  const active = Math.min(page, pages.length - 1);
  return <div className="alerts-text-pages">
    <div className="alerts-text-viewport" ref={viewport}><p className="alerts-message" aria-live="polite">{pages[active]}</p></div>
    <p className="alerts-message alerts-measure" ref={measure} aria-hidden="true" />
    <Pager page={active} pages={pages.length} onChange={setPage} label="detail pages" />
  </div>;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(1);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [detailTab, setDetailTab] = useState("message");
  const rows = useRef(null);
  useEffect(() => {
    let alive = true;
    listAlerts().then((a) => { if (alive) { setAlerts(a); setSelectedId(a[0]?.id ?? null); } })
      .catch((err) => alive && setError(err?.response?.data?.error || "Couldn't load alerts."));
    return () => { alive = false; };
  }, []);
  const list = alerts ?? [];
  const shown = useMemo(() => list.filter((a) => filter === "unread" ? !a.read : filter === "critical" ? a.severity === "CRITICAL" : true), [alerts, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const activePage = Math.min(page, pages - 1);
  const current = list.find((a) => a.id === selectedId);
  useLayoutEffect(() => {
    if (!rows.current) return;
    const update = () => setPageSize(Math.max(1, Math.floor(rows.current.clientHeight / 76)));
    const observer = new ResizeObserver(update);
    observer.observe(rows.current);
    update();
    return () => observer.disconnect();
  }, [Boolean(alerts?.length)]);
  useEffect(() => {
    if (!shown.some((a) => a.id === selectedId)) setSelectedId(shown[0]?.id ?? null);
  }, [shown, selectedId]);
  useEffect(() => setPage((p) => Math.min(p, pages - 1)), [pages]);
  const markRead = async (ids) => {
    const unread = ids.filter((id) => list.some((a) => a.id === id && !a.read));
    if (!unread.length) return;
    try {
      await ackAlerts(unread);
      setAlerts((prev) => prev.map((a) => unread.includes(a.id) ? { ...a, read: true } : a));
      setError(null);
    } catch (err) { setError(err?.response?.data?.error || "Couldn't update alerts."); }
  };
  const select = (id) => { setSelectedId(id); setDetailTab("message"); setMobileDetail(true); };
  return <Page className="alerts-page" title="Alerts" sub="Everything that needs a clinician’s attention, from every module.">
    <div className="alerts-toolbar">
      <Segmented label="Filter alerts" value={filter} onChange={(value) => { setFilter(value); setPage(0); setMobileDetail(false); }} options={[
        { value: "all", label: `All ${list.length}` },
        { value: "unread", label: `Unread ${list.filter((a) => !a.read).length}` },
        { value: "critical", label: `Critical ${list.filter((a) => a.severity === "CRITICAL").length}` },
      ]} />
      {list.some((a) => !a.read) && <button className="alerts-mark-all" type="button" onClick={() => markRead(list.map((a) => a.id))}>Mark all as read</button>}
    </div>
    {error && <p role="alert" className="alerts-error">{error}</p>}
    {!alerts && !error && <p aria-busy="true">Loading alerts…</p>}
    {alerts && <div className={`alerts-layout ${mobileDetail && current ? "alerts-show-detail" : ""}`}>
      <section className="alerts-list-card" aria-label="Alert inbox">
        <header className="alerts-card-heading"><h2>Your inbox</h2><span>{shown.length} alerts</span></header>
        <div className="alerts-rows" ref={rows}>
          {!shown.length && <p className="alerts-empty">{list.length ? "Nothing in this view." : "Nothing needs attention. New alerts will appear here."}</p>}
          <ul>{shown.slice(activePage * pageSize, (activePage + 1) * pageSize).map((a) => <li key={a.id}>
            <button className={`alerts-row ${selectedId === a.id ? "is-selected" : ""}`} type="button" aria-current={selectedId === a.id ? "true" : undefined} onClick={() => select(a.id)}>
              <span className="alerts-row-top"><span>{dayGroup(a.at)} · {time(a.at)}</span><Tag tone={a.severity} /></span>
              <span className="alerts-row-title">{!a.read && <span className="alerts-unread" aria-label="Unread" />}{a.title}</span>
              <span className="alerts-row-meta">{a.patientId} · {a.source}</span>
            </button>
          </li>)}</ul>
        </div>
        <Pager page={activePage} pages={pages} onChange={setPage} label="inbox pages" />
      </section>
      <article className="alerts-detail-card" aria-label="Alert detail">
        {current ? <>
          <header className="alerts-card-heading"><button className="alerts-back" type="button" onClick={() => setMobileDetail(false)}>← Inbox</button><h2>Alert details</h2><Tag tone={current.severity} /></header>
          <p className="alerts-detail-meta">{current.patientId} · {current.source} · {time(current.at)}</p>
          <Segmented label="Alert detail sections" value={detailTab} onChange={setDetailTab} options={[{ value: "message", label: "Message" }, { value: "facts", label: "Clinical facts" }]} />
          <TextPages resetKey={`${current.id}-${detailTab}`} text={detailTab === "message" ? `${current.title}\n\n${current.body || ""}` : (current.facts || []).map(([k, v]) => `${k}: ${v}`).join("\n\n")} />
          <footer className="alerts-actions">
            {!current.read ? <button type="button" onClick={() => markRead([current.id])} className="btn-primary">Acknowledge</button> : <span className="alerts-acknowledged">✓ Acknowledged</span>}
            <Link to={current.link} className="btn-secondary">{current.source === "Reminders" ? "Open reminders" : "Open patient chart"}</Link>
          </footer>
        </> : <p className="alerts-empty">Select an alert to review its details.</p>}
      </article>
    </div>}
  </Page>;
}
