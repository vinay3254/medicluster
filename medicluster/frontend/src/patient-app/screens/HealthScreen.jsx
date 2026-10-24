import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePatient, TabBar } from '../PatientApp';
import { Body } from '../ui';
import { PatientHeading, PatientViews, PatientList, PatientMessage } from '../PatientComponents';
import { READING_TYPES, LEVEL_TEXT, TIERS, assess, formatValue, riskFromReadings } from '../health';
import { RISK_COLORS } from '../../theme';

function readingDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function HealthScreen() {
  const { readings = [], error } = usePatient();
  const [view, setView] = useState('summary');
  const risk = riskFromReadings(readings);
  const latest = Object.entries(READING_TYPES).map(([type, meta]) => {
    const records = readings.filter(reading => reading.type === type);
    return { type, meta, reading: records[0], previous: records[1] };
  });
  const row = (reading, previous) => {
    const meta = READING_TYPES[reading.type] || { label: reading.type, unit: '' };
    const assessment = assess(reading, previous);
    return <div key={reading._id || `${reading.type}-${reading.takenAt}`} className="pt-list-row">
      <div className="min-w-0"><strong>{meta.label}</strong><p className="pt-muted m-0 text-xs">{readingDate(reading.takenAt)}</p><p className={`m-0 text-xs ${LEVEL_TEXT[assessment.level]}`}>{assessment.text}</p></div>
      <div className="shrink-0 text-right"><strong className="font-mono text-lg">{formatValue(reading)}</strong><p className="pt-muted m-0 text-xs">{meta.unit}</p></div>
    </div>;
  };
  return <><Body className="pt-view">
    <PatientHeading title="My health" sub="Your readings, together in one place." actions={<Link className="pt-button" to="/app/health/log">+ Log reading</Link>} />
    {error && <PatientMessage tone="error">{error}</PatientMessage>}
    <PatientViews label="Health views" value={view} onChange={setView} options={[{ id: 'summary', label: 'Overview' }, { id: 'history', label: `History (${readings.length})` }]} />
    {view === 'summary' ? <>
      <section className="pt-card pt-stack" aria-label="Your risk level">
        <div className="pt-row"><strong>Your risk level</strong><span className="pt-pill">{risk?.tier || 'No readings'}</span></div>
        <div className="flex gap-1 h-2 rounded overflow-hidden" role="img" aria-label={risk ? `Risk level ${risk.tier}` : 'No risk level yet'}>{TIERS.map((tier, index) => <div key={tier} className="flex-1" style={{ background: risk?.index === index ? RISK_COLORS[tier] : '#d7dacf' }} />)}</div>
        <p className="pt-muted m-0 text-sm">{risk ? risk.advice : 'Log your blood sugar or blood pressure to see your risk level.'}</p>
      </section>
      <section className="pt-stack" aria-label="Latest readings">{latest.map(({ type, meta, reading, previous }) => reading ? row(reading, previous) : <div key={type} className="pt-list-row"><strong>{meta.label}</strong><span className="pt-muted text-sm">No readings yet</span></div>)}</section>
      <p className="pt-muted m-0 text-xs">Based on your own readings. Not a diagnosis; your doctor sees the full picture.</p>
    </> : <PatientList items={readings} rowHeight={92} label="Reading history pages" empty="No readings yet. Log a reading to start your history." renderItem={(reading, index) => row(reading, readings.slice(readings.indexOf(reading) + 1).find(previous => previous.type === reading.type))} />}
    <Link className="pt-button-secondary" to="/app/reports">View reports and documents</Link>
  </Body><TabBar /></>;
}
