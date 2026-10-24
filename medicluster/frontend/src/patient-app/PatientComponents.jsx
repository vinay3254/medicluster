import React, { useState } from 'react';
import { Pager, usePageCapacity } from '../components/viewport-ui';

export function PatientHeading({ title, sub, actions }) {
  return <header className="pt-heading"><div><p className="pt-eyebrow">MEDICLUSTER · YOUR CARE</p><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{actions}</header>;
}

export function PatientViews({ label, options, value, onChange }) {
  return <div className="pt-view-tabs" role="tablist" aria-label={label}>{options.map(option => <button key={option.id} type="button" role="tab" aria-selected={option.id === value} onClick={() => onChange(option.id)}>{option.label}</button>)}</div>;
}

export function PatientList({ items, renderItem, empty, rowHeight = 88, label = 'List pages' }) {
  const [host, size] = usePageCapacity({ rowHeight, reserved: 62, max: 8 });
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages - 1);
  return <div ref={host} className="pt-paged"><div className="pt-page-rows">{items.length ? items.slice(current * size, (current + 1) * size).map(renderItem) : <div className="pt-empty">{empty}</div>}</div>{pages > 1 && <Pager page={current} pages={pages} onChange={setPage} label={label} />}</div>;
}

export function PatientMessage({ children, tone = 'sage' }) {
  return <div className={`pt-message pt-message-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}
