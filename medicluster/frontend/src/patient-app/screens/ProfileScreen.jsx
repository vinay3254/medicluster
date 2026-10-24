import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePatient } from '../PatientApp';
import { Body, TopBar } from '../ui';
import { PatientHeading, PatientViews, PatientMessage } from '../PatientComponents';
import { isPatientAndroid } from '../patientPlatform';

function profileForm(profile) {
  return { name: profile?.name || '', contactName: profile?.emergencyContact?.name || '', contactRelation: profile?.emergencyContact?.relation || '', contactPhone: profile?.emergencyContact?.phone || '' };
}
function Field({ label, children }) { return <label className="pt-field"><span className="text-sm">{label}</span>{children}</label>; }

export default function ProfileScreen() {
  const { patientId, setPatientId, profile, saveProfile, apiError, offlineStatus = {}, notificationStatus = {}, enableReminders, syncPending, clearOffline } = usePatient();
  const notifications = notificationStatus || {};
  const navigate = useNavigate();
  const [view, setView] = useState('profile');
  const [form, setForm] = useState(() => profileForm(profile));
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setForm(profileForm(profile)), [profile]);
  const set = key => event => setForm(previous => ({ ...previous, [key]: event.target.value }));
  const act = async (name, action, success) => {
    setBusy(name); setError(''); setMessage('');
    try { await action(); if (success) setMessage(success); }
    catch (failure) { setError(apiError(failure)); }
    finally { setBusy(''); }
  };
  const save = event => {
    event.preventDefault();
    const patch = view === 'profile' ? { name: form.name.trim() } : { emergencyContact: { name: form.contactName.trim(), relation: form.contactRelation.trim(), phone: form.contactPhone.trim() } };
    act('save', () => saveProfile(patch), 'Your details have been saved.');
  };
  const signOut = () => { setPatientId(''); navigate('/app'); };
  const savedAt = offlineStatus.savedAt ? new Date(offlineStatus.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No cached records';
  return <><TopBar back="/app" title="Your account" /><Body className="pt-view">
    <PatientHeading title="Profile & settings" sub="Keep your care details up to date." />
    <PatientViews label="Account sections" value={view} onChange={value => { setView(value); setError(''); setMessage(''); }} options={[{ id: 'profile', label: 'Profile' }, { id: 'contact', label: 'Contact' }, { id: 'settings', label: 'Settings' }]} />
    {error && <PatientMessage tone="error">{error}</PatientMessage>}{message && <PatientMessage>{message}</PatientMessage>}
    {view !== 'settings' ? <form className="pt-card pt-stack" onSubmit={save}>
      {view === 'profile' ? <><p className="pt-muted m-0 text-xs break-all">Patient ID: {patientId}</p><Field label="Name"><input className="pt-field" value={form.name} onChange={set('name')} autoComplete="name" required maxLength={120} /></Field></> : <>
        <p className="pt-muted m-0 text-sm">Who should your care team contact in an emergency?</p>
        <Field label="Contact name"><input className="pt-field" value={form.contactName} onChange={set('contactName')} maxLength={120} autoComplete="off" /></Field>
        <Field label="Relation"><input className="pt-field" value={form.contactRelation} onChange={set('contactRelation')} placeholder="Spouse, parent, friend…" maxLength={80} /></Field>
        <Field label="Contact phone"><input className="pt-field" type="tel" value={form.contactPhone} onChange={set('contactPhone')} maxLength={40} autoComplete="off" /></Field>
      </>}
      <button className="pt-button" disabled={Boolean(busy) || offlineStatus.offline} type="submit">{busy === 'save' ? 'Saving…' : 'Save details'}</button>
      {offlineStatus.offline && <p className="pt-muted m-0 text-xs">Connect to the internet to update these details.</p>}
    </form> : <div className="pt-stack min-h-0">
      <section className="pt-card pt-stack" aria-label="Offline data">
        <div className="pt-row"><strong>Offline records</strong><span className="pt-pill">{offlineStatus.offline ? 'Offline' : 'Online'}</span></div>
        <p className="pt-muted m-0 text-sm">{offlineStatus.pending || 0} pending · {offlineStatus.failed || 0} need attention<br />Cached: {savedAt}</p>
        {(offlineStatus.error || offlineStatus.blocked === 'auth') && <p className="m-0 text-xs text-red-700">{offlineStatus.blocked === 'auth' ? 'Sign in again to sync pending changes.' : offlineStatus.error}</p>}
        <div className="pt-actions"><button className="pt-button-secondary" disabled={Boolean(busy) || offlineStatus.offline || !syncPending} onClick={() => act('sync', syncPending)}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button><button className="pt-button-secondary" disabled={Boolean(busy) || !clearOffline} onClick={() => act('clear', clearOffline, 'Cached records and pending changes cleared.')} >Clear cached data</button></div>
        <p className="pt-muted m-0 text-xs">Clearing also removes changes that have not synced.</p>
      </section>
      <section className="pt-card pt-stack" aria-label="Medicine notifications">
        <strong>Medicine reminders</strong>
        {notifications.supported ? <><p className="pt-muted m-0 text-sm">Notifications {notifications.notificationsEnabled ? 'enabled' : 'disabled'} · Precise alarms {notifications.exactAlarms ? 'enabled' : 'unavailable'} · {notifications.scheduledCount || 0} scheduled</p><button className="pt-button-secondary" disabled={Boolean(busy) || !enableReminders} onClick={() => act('reminders', enableReminders)}>Enable reminders</button></> : <p className="pt-muted m-0 text-sm">Install the Android patient app for medicine notifications when the app is closed.</p>}
        {notifications.error && <p role="alert" className="m-0 text-xs text-red-700">{notifications.error}</p>}
      </section>
      <div className="pt-actions"><button className="pt-button-secondary" type="button" onClick={signOut}>Sign out</button>{!isPatientAndroid() && <Link className="pt-button-secondary" to="/download">Get Android app</Link>}</div>
    </div>}
  </Body></>;
}
