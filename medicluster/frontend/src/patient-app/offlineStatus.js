import { useEffect, useState } from 'react';
import { readPatientOfflineStatus, subscribePatientOffline } from './offline.js';

/** Small status object for the existing theme's offline strip; never restores account data. */
export function usePatientOfflineStatus(patientId) {
  const [status, setStatus] = useState({ patientId, offline: globalThis.navigator?.onLine === false, pending: 0, failed: 0, savedAt: null, ageMs: null, error: '' });
  useEffect(() => {
    let active = true;
    const refresh = () => {
      readPatientOfflineStatus(patientId).then(next => active && setStatus({ ...next, patientId })).catch(error => active && setStatus({ patientId, offline: globalThis.navigator?.onLine === false, pending: 0, failed: 0, savedAt: null, ageMs: null, error: error.message }));
    };
    refresh();
    const unsubscribe = subscribePatientOffline(refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    const timer = setInterval(refresh, 60_000);
    return () => { active = false; unsubscribe(); clearInterval(timer); window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
  }, [patientId]);
  return status.patientId === patientId ? status : { patientId, offline: globalThis.navigator?.onLine === false, pending: 0, failed: 0, savedAt: null, ageMs: null, error: '' };
}
