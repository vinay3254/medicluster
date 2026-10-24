import React, { useEffect, useRef, useState } from 'react';
import { usePatient, TabBar } from '../PatientApp';
import { Body, TopBar } from '../ui';
import { PatientHeading, PatientViews, PatientList, PatientMessage } from '../PatientComponents';
import { getDocuments, uploadDocument, getDocumentContent, getDocumentLink } from '../featuresApi';
import { isPatientAndroid } from '../patientPlatform';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 10 * 1024 * 1024;
const rowsFrom = data => Array.isArray(data) ? data : data?.documents || [];
const fileSize = bytes => Number(bytes) >= 1024 * 1024 ? `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(Number(bytes || 0) / 1024))} KB`;
const fileDate = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable';

export default function ReportsScreen() {
  const { patientId, offlineStatus = {}, loadSection, cacheSection, apiError } = usePatient();
  const [view, setView] = useState('documents');
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const input = useRef(null);
  const identity = useRef(patientId);
  identity.current = patientId;
  useEffect(() => { identity.current = patientId; return () => { identity.current = null; }; }, [patientId]);

  useEffect(() => {
    let active = true;
    setBusy('loading'); setDocuments([]); setSelected(null); setError('');
    Promise.resolve().then(() => loadSection ? loadSection('documents', () => getDocuments(patientId)) : getDocuments(patientId))
      .then(data => { if (active) setDocuments(rowsFrom(data)); })
      .catch(failure => { if (active) setError(apiError(failure)); })
      .finally(() => { if (active) setBusy(''); });
    return () => { active = false; };
  }, [patientId, loadSection, apiError]);

  useEffect(() => {
    let active = true;
    let objectUrl;
    setPreviewUrl('');
    setBusy(previous => previous === 'preview' ? '' : previous);
    if (showPreview && selected && !offlineStatus.offline && selected.mimetype?.startsWith('image/')) {
      setBusy('preview');
      getDocumentContent(patientId, selected._id).then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      }).catch(failure => { if (active) { setError(apiError(failure)); setShowPreview(false); } }).finally(() => active && setBusy(''));
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected, showPreview, patientId, offlineStatus.offline, apiError]);

  const chooseFile = event => {
    setError(''); setMessage('');
    const next = event.target.files?.[0];
    if (next && (!ALLOWED_TYPES.has(next.type) || next.size > MAX_SIZE || !next.size)) {
      setFile(null); event.target.value = '';
      setError('Choose a PDF, JPEG, PNG or WebP file, up to 10 MB.');
      return;
    }
    setFile(next || null);
  };
  const upload = async event => {
    event.preventDefault();
    if (!file || offlineStatus.offline || busy) return;
    const owner = patientId;
    setBusy('upload'); setError(''); setMessage('');
    try {
      const saved = await uploadDocument(owner, file);
      if (identity.current !== owner) return;
      const next = saved?._id ? [saved, ...documents.filter(document => document._id !== saved._id)] : rowsFrom(await getDocuments(owner));
      if (identity.current !== owner) return;
      setDocuments(next);
      if (cacheSection) await cacheSection('documents', next);
      setFile(null); if (input.current) input.current.value = '';
      setView('documents'); setMessage('Document uploaded.');
    } catch (failure) { if (identity.current === owner) setError(apiError(failure)); }
    finally { if (identity.current === owner) setBusy(''); }
  };
  const openDocument = async download => {
    if (!selected || offlineStatus.offline || busy) return;
    const owner = patientId;
    const native = isPatientAndroid();
    const popup = native ? null : window.open('about:blank', '_blank');
    if (!native && !popup) { setError('Allow pop-ups to open this document, then try again.'); return; }
    if (popup) popup.opener = null;
    setBusy(download ? 'download' : 'open'); setError('');
    try {
      const response = await getDocumentLink(owner, selected._id, download);
      if (identity.current !== owner) { popup?.close(); return; }
      if (typeof response?.url !== 'string' || !response.url) throw new Error('This document link is unavailable. Please try again.');
      const url = new URL(response.url, window.location.origin);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('This document link is unavailable. Please try again.');
      if (native) window.location.assign(url.href);
      else popup.location.replace(url.href);
    } catch (failure) { popup?.close(); if (identity.current === owner) setError(apiError(failure)); }
    finally { if (identity.current === owner) setBusy(''); }
  };

  return <><TopBar back="/app/health" title="Reports" /><Body className="pt-view">
    <PatientHeading title="Reports & documents" sub="Your medical files, kept private." />
    <PatientViews label="Report views" value={view} onChange={value => { setView(value); setSelected(null); setShowPreview(false); setError(''); setMessage(''); }} options={[{ id: 'documents', label: `Documents (${documents.length})` }, { id: 'upload', label: 'Upload' }]} />
    {error && <PatientMessage tone="error">{error}</PatientMessage>}{message && <PatientMessage>{message}</PatientMessage>}
    {offlineStatus.offline && <PatientMessage>Showing cached document details. Files are unavailable offline.</PatientMessage>}
    {view === 'upload' ? <form className="pt-card pt-stack" onSubmit={upload}>
      <strong>Add a medical document</strong><p className="pt-muted m-0 text-sm">PDF, JPEG, PNG or WebP · Up to 10 MB</p>
      <label className="pt-field">Choose file<input ref={input} className="pt-field h-auto py-2" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={Boolean(busy) || offlineStatus.offline} /></label>
      {file && <p className="pt-muted m-0 text-sm break-all">{file.name} · {fileSize(file.size)}</p>}
      <button className="pt-button" type="submit" disabled={!file || Boolean(busy) || offlineStatus.offline}>{busy === 'upload' ? 'Uploading…' : 'Upload document'}</button>
      <p className="pt-muted m-0 text-xs">Connect to upload files. Only document details are saved for offline viewing.</p>
    </form> : selected ? <section className="pt-card pt-stack pt-document-detail min-h-0">
      <button className="pt-button-secondary self-start" onClick={() => { setSelected(null); setShowPreview(false); setError(''); }}>‹ All documents</button>
      <h2 className="m-0 text-lg break-all">{selected.original_name}</h2><p className="pt-muted m-0 text-sm">{fileDate(selected.createdAt)} · {fileSize(selected.size)}</p>
      {previewUrl && <img className="pt-document-preview" src={previewUrl} alt={`Preview of ${selected.original_name}`} />}
      <div className="pt-actions flex-wrap">{selected.mimetype?.startsWith('image/') && !showPreview && <button className="pt-button-secondary" disabled={Boolean(busy) || offlineStatus.offline} onClick={() => { setShowPreview(true); setError(''); }}>Preview image</button>}<button className="pt-button" disabled={Boolean(busy) || offlineStatus.offline} onClick={() => openDocument(false)}>{busy === 'open' ? 'Opening…' : 'View file'}</button><button className="pt-button-secondary" disabled={Boolean(busy) || offlineStatus.offline} onClick={() => openDocument(true)}>{busy === 'download' ? 'Preparing…' : 'Download'}</button></div>
      {busy === 'preview' && <p role="status" className="pt-muted m-0 text-sm">Loading preview…</p>}
      <p className="pt-muted m-0 text-xs">Private links expire after two minutes. {offlineStatus.offline ? 'Reconnect to open this file.' : 'Files open in your browser.'}</p>
    </section> : <PatientList items={documents} rowHeight={86} label="Document pages" empty={busy === 'loading' ? 'Loading documents…' : 'No documents yet. Upload a report to keep it here.'} renderItem={document => <button key={document._id} className="pt-list-row" onClick={() => { setSelected(document); setShowPreview(false); setError(''); setMessage(''); }}><div className="min-w-0"><strong className="block truncate">{document.original_name}</strong><p className="pt-muted m-0 text-xs">{fileDate(document.createdAt)} · {fileSize(document.size)}</p></div><span className="pt-pill shrink-0">Details ›</span></button>} />}
  </Body><TabBar /></>;
}
