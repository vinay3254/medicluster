import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, HeartPulse, CalendarDays, FileText, MessageCircle, Siren } from 'lucide-react';
import { usePatient, TabBar } from '../PatientApp';
import { Body, ErrorNote, initials } from '../ui';
import { PatientList, PatientViews } from '../PatientComponents';
import { formatTime12 } from '../../data/schedule';

export default function TodayScreen() {
  const { profile, todaySlots, now, takeSlot, snoozeSlot, apiError, error, loading, offlineStatus } = usePatient();
  const [view, setView] = useState('next');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const next = todaySlots.find(slot => !slot.taken);
  const firstName = (profile?.name || '').split(/\s+/)[0];
  const take = async () => { setBusy(true); setActionError(''); try { await takeSlot(next); } catch (err) { setActionError(apiError(err)); } finally { setBusy(false); } };
  const shortcuts = [[HeartPulse, '/app/health', 'My health', 'Readings & trends'], [CalendarDays, '/app/visits', 'Visits & medicines', 'Appointments & care'], [FileText, '/app/reports', 'My reports', 'Files & test results'], [MessageCircle, '/app/cliniq', 'Ask CliniQ', 'Questions about care']];
  return <><Body className="pt-home">
    <header className="mc-patient-greeting"><div><p>{now.toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'short'})}</p><h1>{now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'}{firstName ? `, ${firstName}` : ''}</h1></div><Link to="/app/profile" aria-label="Profile and settings" className="mc-patient-avatar">{initials(profile?.name)}</Link></header>
    <ErrorNote>{error || actionError}</ErrorNote>
    <nav className="pt-shortcuts" aria-label="Your care shortcuts">{shortcuts.map(([Icon,to,title,sub]) => <Link to={to} key={to} className="pt-shortcut"><Icon size={19} strokeWidth={1.7}/><ArrowUpRight size={14} className="pt-shortcut-arrow"/><strong>{title}</strong><span>{sub}</span></Link>)}</nav>
    <section className="pt-card pt-grow">
      <PatientViews label="Today's medicines" value={view} onChange={setView} options={[{id:'next',label:'Next dose'},{id:'today',label:`Today · ${todaySlots.length}`}]} />
      {view === 'next' ? next ? <div className="pt-dose"><div className="pt-dose-time">{formatTime12(next.time)}<span>Next scheduled dose</span></div><strong>{next.reminders.map(r => r.medicationName).join(', ')}</strong><p className="pt-muted">{next.reminders.map(r => r.dosage).filter(Boolean).join(', ')}</p><div className="pt-actions"><button className="pt-button" onClick={take} disabled={busy}>{busy ? 'Saving…' : next.reminders.length > 1 ? 'I’ve taken them' : 'I’ve taken it'}</button><button className="pt-button-secondary" onClick={() => snoozeSlot(next)} disabled={busy}>Later</button></div>{offlineStatus.pending > 0 && <p className="pt-muted">Your updates are waiting to sync.</p>}</div> : <div className="pt-empty"><strong>{loading ? 'Loading your care…' : todaySlots.length ? 'All done for today' : 'Your schedule is clear'}</strong><p>{todaySlots.length ? 'Your recorded doses are up to date.' : 'Your medicines appear here when your care team adds them.'}</p></div> : <PatientList items={todaySlots} label="Medicine schedule pages" empty="No medicines scheduled today." renderItem={slot => <div className="pt-list-row" key={slot.time}><div><strong>{formatTime12(slot.time)}</strong><p>{slot.reminders.map(r => r.medicationName).join(', ')}</p></div><span className={`pt-pill ${slot.taken ? 'pt-positive' : ''}`}>{slot.taken ? 'Taken' : 'Due'}</span></div>} />}
    </section>
    <Link to="/app/emergency" className="pt-emergency-link"><Siren size={18}/><span>Emergency help & ambulance tracking</span><ArrowUpRight size={16}/></Link>
  </Body><TabBar/></>;
}
