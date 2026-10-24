import React, { useState } from "react";
import { Link } from "react-router-dom";
import { updateReminder } from "../../api/apiClient";
import { usePatient } from "../PatientApp";
import { Body, ListHeader, ErrorNote, TopBar } from "../ui";
import { dosesPerDay } from "../../data/schedule";

function visitCountdown(at, now) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  if (days < 0) return "PAST VISIT";
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  return `IN ${days} DAYS`;
}

function refillEstimate(reminder, now) {
  const perDay = dosesPerDay(reminder);
  if (!perDay) return { text: "Taken as needed", low: false };
  const days = Math.floor(reminder.pillsLeft / perDay);
  if (days <= 0) return { text: "Run out", low: true };
  if (days <= 7) {
    const runOut = new Date(now);
    runOut.setDate(runOut.getDate() + days);
    return { text: `Runs out ${runOut.toLocaleDateString("en-GB", { weekday: "long" })}`, low: true };
  }
  const weeks = Math.round(days / 7);
  return { text: `About ${weeks} week${weeks > 1 ? "s" : ""}`, low: false };
}

export default function VisitsScreen() {
  const { profile, saveProfile, reminders, refreshReminders, now, apiError } = usePatient();
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(null);

  const visit = profile?.nextVisit;
  const visitAt = visit?.at ? new Date(visit.at) : null;
  const tracked = reminders.filter((r) => r.active && typeof r.pillsLeft === "number");

  const toggleItem = async (index) => {
    const checklist = visit.checklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    setError("");
    try {
      await saveProfile({ nextVisit: { ...visit, checklist } });
    } catch (err) {
      setError(apiError(err));
    }
  };

  const requestRefill = async (reminder) => {
    setRequesting(reminder._id);
    setError("");
    try {
      await updateReminder(reminder._id, { refillRequestedAt: new Date().toISOString() });
      await refreshReminders();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setRequesting(null);
    }
  };

  return (
    <>
      <TopBar back="/app" title="Visits & medicines" />
      <Body className="px-[22px] pt-[18px] pb-6 flex flex-col gap-[22px]">
        <ErrorNote>{error}</ErrorNote>

        {visitAt ? (
          <div className="mc-patient-card flex flex-col gap-3" data-tone="forest">
            <span className="font-mono text-[10px] tracking-[0.08em] opacity-70">NEXT VISIT · {visitCountdown(visitAt, now)}</span>
            <span className="font-serif text-[26px] leading-[1.1]">
              {visitAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")},{" "}
              {visitAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-sm opacity-80">
              {[visit.doctor, visit.department].filter(Boolean).join(" · ")}
              {visit.location && <><br />{visit.location}</>}
            </span>
            <div className="flex gap-2">
              {visit.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.location)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 h-11 grid place-items-center bg-paper text-ink rounded text-sm font-medium"
                >
                  Directions
                </a>
              )}
              <Link to="/app/profile" className="flex-1 h-11 grid place-items-center border border-slate-500 rounded text-sm">
                Reschedule
              </Link>
            </div>
          </div>
        ) : (
          <div className="mc-patient-card flex flex-col gap-3">
            <span className="text-sm text-slate-600">No visit booked.</span>
            <Link to="/app/profile" className="h-11 grid place-items-center border border-ink rounded text-sm font-medium">
              Add your next visit
            </Link>
          </div>
        )}

        {visit?.checklist?.length > 0 && (
          <div className="mc-patient-card flex flex-col">
            <ListHeader title="Bring to your visit" />
            {visit.checklist.map((item, i) => (
              <label key={i} className="flex gap-3 items-center min-h-12 border-b border-line text-sm cursor-pointer">
                <input type="checkbox" checked={item.done} onChange={() => toggleItem(i)} className="sr-only peer" />
                <span
                  aria-hidden="true"
                  className={`w-[18px] h-[18px] grid place-items-center rounded-sm text-[11px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue-600 ${item.done ? "bg-ink text-paper" : "border border-line-strong"}`}
                >
                  {item.done ? "✓" : ""}
                </span>
                {item.label}
              </label>
            ))}
          </div>
        )}

        <div className="mc-patient-card flex flex-col">
          <ListHeader title="Refills" meta="PILLS LEFT" />
          {tracked.length === 0 && (
            <span className="py-3 text-sm text-slate-500">Pill counts appear here once your care team tracks them.</span>
          )}
          {tracked.map((r) => {
            const est = refillEstimate(r, now);
            return (
              <div key={r._id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center py-3 border-b border-line">
                <span className="text-sm font-medium">{r.medicationName}{r.dosage ? ` ${r.dosage}` : ""}</span>
                <span className={`font-mono text-[15px] ${est.low ? "text-orange-600" : ""}`}>{r.pillsLeft}</span>
                <span className={`text-xs ${est.low ? "text-orange-600" : "text-slate-500"}`}>{est.text}</span>
                {r.refillRequestedAt ? (
                  <span className="text-xs text-emerald-700">
                    Requested {new Date(r.refillRequestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                ) : est.low ? (
                  <button
                    onClick={() => requestRefill(r)}
                    disabled={requesting === r._id}
                    className="text-[13px] text-blue-600 hover:text-ink underline disabled:opacity-50"
                  >
                    {requesting === r._id ? "Requesting…" : "Request refill"}
                  </button>
                ) : <span />}
              </div>
            );
          })}
        </div>
      </Body>
    </>
  );
}
