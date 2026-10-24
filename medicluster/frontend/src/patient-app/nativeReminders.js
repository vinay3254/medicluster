import { isPatientAndroid } from './patientPlatform';

const send = (action) => {
  if (isPatientAndroid()) window.location.assign(`mediclusterpatient://${action}`);
};

/** Native accepts this snapshot only from its configured patient WebView origin. */
export function syncNativeReminders(patientId, reminders = []) {
  if (!isPatientAndroid()) return;
  // Keep native data bounded: only the fields needed for local notification scheduling.
  const cutoff = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  window.MediClusterReminderSchedule = {
    patientId: String(patientId || ''),
    reminders: reminders.map((r) => ({
      _id: r._id, medicationName: r.medicationName, dosage: r.dosage || '',
      frequency: r.frequency, active: r.active !== false,
      times: r.times || [], days: r.days || [],
      doseLog: (r.doseLog || []).filter((l) => l.date >= cutoff).map(({ date, time }) => ({ date, time })),
    })),
  };
  send('reminder-sync');
}

export function clearNativeReminders() { syncNativeReminders('', []); }
/** Invoke only from an explicit user gesture. Permission is never requested by sync. */
export function requestNativeReminderPermission() { send('enable-reminders'); }
export function getNativeReminderStatus() {
  return isPatientAndroid() ? window.MediClusterNativeReminderStatus || null : { supported: false };
}
export function subscribeNativeReminderStatus(callback) {
  const listener = (event) => callback(event.detail);
  window.addEventListener('medicluster:native-reminder-status', listener);
  return () => window.removeEventListener('medicluster:native-reminder-status', listener);
}
