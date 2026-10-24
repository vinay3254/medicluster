import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { House, MessageCircle, HeartPulse, CalendarDays, FileText } from "lucide-react";
import {
  listReminders, markDoseTaken, getPatientProfile, updatePatientProfile, listReadings,
  getPatientToken, setPatientToken, logReading,
} from "../api/apiClient";
import { dateKey, slotsOn, toMinutes, nowMinutes } from "../data/schedule";
import TodayScreen from "./screens/TodayScreen";
import CliniqScreen from "./screens/CliniqScreen";
import HealthScreen from "./screens/HealthScreen";
import LogReadingScreen from "./screens/LogReadingScreen";
import VisitsScreen from "./screens/VisitsScreen";
import EmergencyScreen from "./screens/EmergencyScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ReportsScreen from "./screens/ReportsScreen";
import { savePatientSnapshot, readPatientSnapshot, clearPatientOffline, enqueuePatientMutation, flushPatientMutations, registerPatientServiceWorker } from "./offline";
import { usePatientOfflineStatus } from "./offlineStatus";
import { syncNativeReminders, clearNativeReminders, requestNativeReminderPermission, getNativeReminderStatus, subscribeNativeReminderStatus } from "./nativeReminders";
import "./patient-theme.css";
import ReminderAlert from "./ReminderAlert";
import LoginScreen from "./screens/LoginScreen";
import "../auth/auth-artwork.css";
import { isPatientAndroid } from "./patientPlatform";

const PatientContext = createContext(null);
export const usePatient = () => useContext(PatientContext);

const PATIENT_KEY = "medicluster.patientId";
const SNOOZE_KEY = "medicluster.snoozes";
const SNOOZE_MS = 30 * 60 * 1000;
// Don't raise an alert for doses more than this many minutes overdue.
const ALERT_WINDOW_MIN = 120;

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state still lives in memory */
  }
}

export const slotKey = (slot) => `${slot.date}|${slot.time}`;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function apiError(err) {
  return err?.response?.data?.error || err?.message || "Something went wrong";
}

export default function PatientApp() {
  // Signed in = a patient token plus the patient it belongs to.
  const [patientId, setPatientIdState] = useState(() => (getPatientToken() ? readStorage(PATIENT_KEY, "") : ""));
  const [profile, setProfile] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [readings, setReadings] = useState([]);
  const offlineStatus = usePatientOfflineStatus(patientId);
  const [notificationStatus, setNotificationStatus] = useState(getNativeReminderStatus);
  const identity = useRef(patientId);
  identity.current = patientId;
  const loadedFor = useRef('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snoozes, setSnoozes] = useState(() => readStorage(SNOOZE_KEY, {}));
  const now = useNow();

  // Setting "" signs the patient out.
  const setPatientId = useCallback((id, { preserveOffline = false } = {}) => {
    const previous = readStorage(PATIENT_KEY, '');
    if (!id || previous !== id) {
      if (previous && !preserveOffline) clearPatientOffline(previous).catch(() => {});
      clearNativeReminders();
      setProfile(null); setReminders([]); setReadings([]); setSnoozes({});
      writeStorage(SNOOZE_KEY, {});
      loadedFor.current = '';
    }
    identity.current = id;
    if (!id) setPatientToken(null);
    writeStorage(PATIENT_KEY, id);
    setPatientIdState(id);
  }, []);

  const signIn = useCallback(({ token, patientId: id }) => {
    const previous = readStorage(PATIENT_KEY, '');
    if (previous && previous !== id) clearPatientOffline(previous).catch(() => {});
    setPatientToken(token);
    setPatientId(id);
  }, [setPatientId]);

  useEffect(() => {
    const onSignedOut = () => setPatientId('', { preserveOffline: true });
    window.addEventListener('medicluster:patient-signed-out', onSignedOut);
    return () => window.removeEventListener('medicluster:patient-signed-out', onSignedOut);
  }, [setPatientId]);
  useEffect(() => { registerPatientServiceWorker().catch(() => {}); return subscribeNativeReminderStatus(setNotificationStatus); }, []);
  useEffect(() => { if (patientId && loadedFor.current === patientId) syncNativeReminders(patientId, reminders); }, [patientId, reminders]);

  const refreshReminders = useCallback(async () => {
    if (!patientId) return;
    setReminders(await listReminders(patientId));
  }, [patientId]);

  const refreshReadings = useCallback(async () => {
    if (!patientId) return;
    setReadings(await listReadings(patientId));
  }, [patientId]);

  const refreshPatient = useCallback(async () => {
    if (!patientId) return;
    const [p, rems, reads] = await Promise.all([getPatientProfile(patientId), listReminders(patientId), listReadings(patientId)]);
    if (identity.current !== patientId) return;
    loadedFor.current = patientId;
    setProfile(p); setReminders(rems); setReadings(reads); setError('');
    await savePatientSnapshot(patientId, { profile: p, reminders: rems, readings: reads }).catch(() => {});
  }, [patientId]);

  const syncPending = useCallback(async () => {
    if (!patientId || navigator.onLine === false) return;
    const result = await flushPatientMutations(patientId, {
      reading: (payload, { idempotencyKey }) => logReading(patientId, payload, idempotencyKey),
      dose: (payload, { idempotencyKey }) => markDoseTaken(payload.reminderId, payload.date, payload.time, idempotencyKey),
    });
    if (identity.current !== patientId) return;
    if (result.error && !result.blocked) setError(result.error);
    if (!result.blocked) await refreshPatient();
  }, [patientId, refreshPatient]);

  useEffect(() => {
    setProfile(null); setReminders([]); setReadings([]);
    if (!patientId) return;
    let cancelled = false;
    setLoading(true);
    readPatientSnapshot(patientId).then(snapshot => {
      if (snapshot && !cancelled && loadedFor.current !== patientId) {
        loadedFor.current = patientId;
        setProfile(snapshot.profile); setReminders(snapshot.reminders || []); setReadings(snapshot.readings || []);
      }
    }).catch(() => {});
    if (navigator.onLine !== false) syncPending().catch(err => !cancelled && setError(apiError(err))).finally(() => !cancelled && setLoading(false));
    else setLoading(false);
    const online = () => syncPending().catch(err => !cancelled && setError(apiError(err)));
    window.addEventListener('online', online);
    return () => { cancelled = true; window.removeEventListener('online', online); };
  }, [patientId, syncPending]);

  const cacheSection = useCallback(async (key, data) => { if (patientId) await savePatientSnapshot(patientId, { sections: { [key]: data } }).catch(() => {}); }, [patientId]);
  const loadSection = useCallback(async (key, loader) => {
    try {
      if (navigator.onLine === false) throw new Error('offline');
      const data = await loader();
      if (identity.current !== patientId) return [];
      await cacheSection(key, data); return data;
    } catch (err) {
      if (err.response) throw err;
      const snapshot = await readPatientSnapshot(patientId).catch(() => null);
      if (snapshot?.sections?.[key]) return snapshot.sections[key];
      throw new Error(navigator.onLine === false ? 'No saved data for this screen. Connect once to load it.' : apiError(err));
    }
  }, [patientId, cacheSection]);
  const clearOffline = useCallback(async () => { await clearPatientOffline(patientId); }, [patientId]);
  const saveReading = useCallback(async reading => {
    const payload = { ...reading, takenAt: new Date().toISOString() };
    const queued = await enqueuePatientMutation(patientId, 'reading', payload);
    if (navigator.onLine !== false) await syncPending();
    return queued;
  }, [patientId, syncPending]);

  const saveProfile = useCallback(async (patch) => {
    const saved = await updatePatientProfile(patientId, patch);
    setProfile(saved);
    return saved;
  }, [patientId]);

  const takeSlot = useCallback(async slot => {
    const pending = slot.reminders.filter(r => !(r.doseLog ?? []).some(l => l.date === slot.date && l.time === slot.time));
    if (navigator.onLine === false) {
      for (const r of pending) await enqueuePatientMutation(patientId, 'dose', { reminderId: r._id, date: slot.date, time: slot.time });
      return;
    }
    const updated = await Promise.all(pending.map(r => markDoseTaken(r._id, slot.date, slot.time)));
    if (identity.current !== patientId) return;
    const byId = new Map(updated.map(r => [r._id, r]));
    setReminders(prev => prev.map(r => byId.get(r._id) ?? r));
  }, [patientId]);

  const snoozeSlot = useCallback((slot) => {
    setSnoozes((prev) => {
      const today = dateKey(new Date());
      // Drop snoozes from earlier days so storage doesn't grow forever.
      const kept = Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith(today)));
      const next = { ...kept, [slotKey(slot)]: Date.now() + SNOOZE_MS };
      writeStorage(SNOOZE_KEY, next);
      return next;
    });
  }, []);

  const todaySlots = useMemo(() => slotsOn(reminders, now), [reminders, now]);

  const value = {
    patientId, setPatientId, profile, saveProfile,
    reminders, refreshReminders, readings, refreshReadings,
    todaySlots, now, snoozes, takeSlot, snoozeSlot,
    loading, error, setError, apiError, offlineStatus, notificationStatus, enableReminders: requestNativeReminderPermission, syncPending, clearOffline, loadSection, cacheSection, saveReading,
  };

  return (
    <PatientContext.Provider value={value}>
      <PhoneFrame signedIn={Boolean(patientId)}>
        {patientId && (offlineStatus.offline || offlineStatus.pending || offlineStatus.failed) ? <div className="pt-offline-strip" role="status">{offlineStatus.offline ? 'Offline · saved data' : 'Syncing your care'}{offlineStatus.savedAt && offlineStatus.offline ? ` · ${new Date(offlineStatus.savedAt).toLocaleDateString()}` : ''}{offlineStatus.pending ? ` · ${offlineStatus.pending} pending` : ''}{offlineStatus.failed ? ` · ${offlineStatus.failed} need review` : ''}</div> : null}
        {patientId ? <AppRoutes /> : <LoginScreen onSignedIn={signIn} />}
        {patientId && <DoseAlerts />}
      </PhoneFrame>
    </PatientContext.Provider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<TodayScreen />} />
      <Route path="cliniq" element={<CliniqScreen />} />
      <Route path="health" element={<HealthScreen />} />
      <Route path="health/log" element={<LogReadingScreen />} />
      <Route path="visits" element={<VisitsScreen />} />
      <Route path="reports" element={<ReportsScreen />} />
      <Route path="emergency" element={<EmergencyScreen />} />
      <Route path="profile" element={<ProfileScreen />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

/** Full-screen on phones; a 390×844 device frame on larger screens. */
function PhoneFrame({ children, signedIn }) {
  if (isPatientAndroid()) {
    if (signedIn) return <div className="mc-patient-app h-[100dvh] w-full bg-paper text-ink overflow-hidden flex flex-col">{children}</div>;
    return <div className="mc-patient-auth-shell h-[100dvh] w-full flex items-center justify-center"><div className="mc-patient-device relative bg-paper text-ink overflow-hidden flex flex-col">{children}</div></div>;
  }
  return (
    <div className={`${signedIn ? "" : "mc-patient-auth-shell"} min-h-[100dvh] bg-sunken flex items-center justify-center sm:py-8`}>
      <div className={`${signedIn ? "mc-patient-app" : "mc-patient-device"} relative w-full h-[100dvh] sm:w-[390px] sm:h-[844px] sm:rounded-[44px] sm:border-[10px] sm:border-ink bg-paper text-ink overflow-hidden flex flex-col`}>
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

function StatusBar() {
  const { now } = usePatient();
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
  return (
    <div className="hidden sm:flex h-12 shrink-0 justify-between items-end px-7 pb-1.5 text-[15px] font-semibold">
      <span>{time}</span>
      <span className="font-mono text-xs">5G ▮▮▮</span>
    </div>
  );
}

const TABS = [
  { to: "/app", label: "Today", end: true, icon: House },
  { to: "/app/visits", label: "Care", icon: CalendarDays },
  { to: "/app/health", label: "My health", icon: HeartPulse },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/cliniq", label: "CliniQ", icon: MessageCircle },
];

export function TabBar() {
  return <nav className="mc-patient-tabs" aria-label="Patient navigation">
    {TABS.map(({ to, label, end, icon: Icon }) => <NavLink key={to} to={to} end={end}>
      <Icon size={20} strokeWidth={1.6} aria-hidden="true" />{label}
    </NavLink>)}
  </nav>;
}

/** Raises the reminder sheet (and a system notification when the tab is hidden) for due doses. */
function DoseAlerts() {
  const { todaySlots, now, snoozes, takeSlot, snoozeSlot } = usePatient();
  const [dismissed, setDismissed] = useState(() => new Set());
  const notified = useRef(new Set());
  const { pathname } = useLocation();

  const due = todaySlots.find((slot) => {
    const overdueBy = nowMinutes(now) - toMinutes(slot.time);
    return !slot.taken
      && overdueBy >= 0 && overdueBy <= ALERT_WINDOW_MIN
      && !(snoozes[slotKey(slot)] > now.getTime())
      && !dismissed.has(slotKey(slot));
  });

  useEffect(() => {
    if (!due || notified.current.has(slotKey(due))) return;
    notified.current.add(slotKey(due));
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      const names = due.reminders.map((r) => `${r.medicationName}${r.dosage ? ` ${r.dosage}` : ""}`).join(" and ");
      new Notification("Time for your medicines", { body: names, tag: slotKey(due) });
    }
  }, [due]);

  // Never cover an emergency call in progress.
  if (!due || pathname.startsWith("/app/emergency")) return null;

  const dismiss = () => setDismissed((prev) => new Set(prev).add(slotKey(due)));
  return (
    <ReminderAlert
      slot={due}
      now={now}
      onTaken={async () => { await takeSlot(due); dismiss(); }}
      onSnooze={() => { snoozeSlot(due); dismiss(); }}
      onClose={dismiss}
    />
  );
}
