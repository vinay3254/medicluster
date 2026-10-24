import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, CalendarDays, HeartPulse, MessageCircle } from "lucide-react";
import { usePatient, TabBar, slotKey } from "../PatientApp";
import { Body, ListHeader, ErrorNote, initials } from "../ui";
import { adherence, formatRelative, formatTime12, joinNames, nowMinutes, toMinutes } from "../../data/schedule";

function greeting(now) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function TodayScreen() {
  const { profile, reminders, todaySlots, now, snoozes, takeSlot, snoozeSlot, loading, error, apiError } = usePatient();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const next = todaySlots.find((s) => !s.taken);
  const doses = todaySlots.flatMap((s) => s.reminders.map((r) => ({ r, s })));
  const takenCount = doses.filter(({ r, s }) => (r.doseLog ?? []).some((l) => l.date === s.date && l.time === s.time)).length;
  const week = adherence(reminders, now);
  const firstName = (profile?.name ?? "").split(/\s+/)[0];

  const snoozedUntil = next && snoozes[slotKey(next)] > now.getTime() ? new Date(snoozes[slotKey(next)]) : null;
  const notes = next ? [...new Set(next.reminders.map((r) => r.notes).filter(Boolean))] : [];

  let headline = "No medicines scheduled today";
  if (next) headline = `Next: ${joinNames(next.reminders.map((r) => r.medicationName))} at ${formatTime12(next.time)}`;
  else if (todaySlots.length) headline = "All done for today";

  const take = async () => {
    setBusy(true);
    setActionError("");
    try {
      await takeSlot(next);
    } catch (err) {
      setActionError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const canNotify = typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";
  const [, forceRender] = useState(0);

  return (
    <>
      <Body className="px-[22px] pt-[18px] pb-6 flex flex-col gap-6">
        <header className="mc-patient-greeting">
          <div><p>{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</p><h1>{greeting(now)}{firstName ? `, ${firstName}` : ""}<span className="text-blue-500">.</span></h1></div>
          <Link to="/app/profile" aria-label="Profile and settings" className="mc-patient-avatar">{initials(profile?.name)}</Link>
        </header>
        <ErrorNote>{error}</ErrorNote>
        <section className="mc-patient-feature" aria-labelledby="patient-care-title">
          <p className="mc-card-eyebrow">YOUR EVERYDAY CARE</p>
          <h2 id="patient-care-title">{loading ? "Loading…" : headline}</h2>
          <img src="/images/care-island.webp" alt="" width="1536" height="1024" decoding="async" />
          {!loading && !todaySlots.length && <p>Your care team adds medicines to your plan in MediCluster.</p>}
          {!loading && todaySlots.length > 0 && <p>A little care, one day at a time. Your next steps are right here.</p>}
        </section>

        <nav className="mc-patient-actions" aria-label="Your care shortcuts">
          <Link to="/app/health" className="mc-action-card" data-tone="forest"><span className="mc-card-icon"><HeartPulse size={20} strokeWidth={1.5} aria-hidden="true" /></span><ArrowUpRight className="mc-card-arrow" size={16} aria-hidden="true" /><h3>My health</h3><p>Readings &amp; trends</p></Link>
          <Link to="/app/visits" className="mc-action-card" data-tone="peach"><span className="mc-card-icon"><CalendarDays size={20} strokeWidth={1.5} aria-hidden="true" /></span><ArrowUpRight className="mc-card-arrow" size={16} aria-hidden="true" /><h3>Visits &amp; medicines</h3><p>Your care, organised</p></Link>
        </nav>

        {next && (
          <div className="mc-patient-card flex flex-col gap-2.5">
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium">
                {notes.length ? notes.join("; ") : next.reminders.map((r) => r.dosage).filter(Boolean).join(", ") || "Your scheduled dose"}
              </span>
              <span className="font-mono text-slate-500 shrink-0">
                {snoozedUntil
                  ? `snoozed to ${snoozedUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : formatRelative(toMinutes(next.time) - nowMinutes(now))}
              </span>
            </div>
            <ErrorNote>{actionError}</ErrorNote>
            <div className="flex gap-2">
              <button
                onClick={take}
                disabled={busy}
                className="flex-1 h-12 rounded bg-ink text-paper text-[15px] font-medium disabled:opacity-50"
              >
                {busy ? "Saving…" : next.reminders.length > 1 ? "I’ve taken them" : "I’ve taken it"}
              </button>
              <button
                onClick={() => snoozeSlot(next)}
                disabled={busy}
                className="h-12 px-4 rounded border border-line-strong text-[15px]"
              >
                Later
              </button>
            </div>
          </div>
        )}

        {todaySlots.length > 0 && (
          <div className="mc-patient-card flex flex-col">
            <ListHeader title="Today" meta={`${takenCount} of ${doses.length}`} />
            {todaySlots.map((slot) => {
              const isNext = slot === next;
              const overdue = !slot.taken && toMinutes(slot.time) < nowMinutes(now);
              return (
                <div
                  key={slot.time}
                  className="grid grid-cols-[44px_12px_minmax(0,1fr)_auto] gap-2 items-center min-h-[52px] py-2 border-b border-line text-sm"
                >
                  <span className={`font-mono ${slot.taken ? "text-slate-500" : ""}`}>{slot.time}</span>
                  <span className={`w-2.5 h-2.5 ${slot.taken ? "bg-emerald-500" : "border-[1.5px] border-ink"}`} />
                  <span className={`min-w-0 break-words ${isNext ? "font-medium" : ""}`}>
                    {slot.reminders.map((r) => r.medicationName).join(", ")}
                  </span>
                  <span className={`text-xs ${slot.taken ? "text-emerald-700" : overdue ? "text-orange-600" : "text-slate-500"}`}>
                    {slot.taken ? "Taken" : overdue ? "Overdue" : "Due"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {week.pct != null && (
          <div className="mc-patient-card flex justify-between items-center" data-tone="sage">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">This week</span>
              <span className="text-xs text-slate-500">
                {week.missed ? `${week.missed} missed dose${week.missed > 1 ? "s" : ""}` : "No missed doses"}
              </span>
            </div>
            <span className="font-serif text-[30px]">{week.pct}%</span>
          </div>
        )}

        <Link to="/app/cliniq" className="mc-patient-notify"><MessageCircle size={20} strokeWidth={1.5} aria-hidden="true" /><span><strong className="block font-medium">A question on your mind?</strong><span className="text-slate-500">Ask CliniQ about your everyday care.</span></span><ArrowUpRight size={17} aria-hidden="true" /></Link>
        {canNotify && <button onClick={() => Notification.requestPermission().then(() => forceRender(n => n + 1))} className="mc-patient-notify"><Bell size={19} strokeWidth={1.5} aria-hidden="true" /><span>Turn on reminder alerts</span><ArrowUpRight size={16} aria-hidden="true" /></button>}
        <Link to="/app/emergency" className="mc-patient-emergency"><span>Need urgent help?</span><span className="inline-flex items-center gap-2">Emergency help<ArrowUpRight size={16} aria-hidden="true" /></span></Link>

      </Body>
      <TabBar />
    </>
  );
}
