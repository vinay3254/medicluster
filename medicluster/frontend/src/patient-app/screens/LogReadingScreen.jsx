import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePatient } from "../PatientApp";
import { TopBar, ErrorNote } from "../ui";
import { READING_TYPES, GLUCOSE_CONTEXTS, assess, glucoseTarget } from "../health";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
const MAX_LEN = { glucose: 3, bp: 7, weight: 5 };

/** Parse keypad entry into a reading, or null if incomplete. */
function toReading(type, entry, context) {
  if (type === "bp") {
    const m = entry.match(/^(\d{2,3})\/(\d{2,3})$/);
    return m ? { type, value: Number(m[1]), diastolic: Number(m[2]) } : null;
  }
  const value = Number(entry);
  if (!entry || !Number.isFinite(value) || value <= 0) return null;
  return type === "glucose" ? { type, value, context } : { type, value };
}

function feedback(reading, history) {
  if (!reading) return null;
  const status = assess(reading, history[0]);
  if (reading.type === "glucose") {
    const ctx = GLUCOSE_CONTEXTS.find((c) => c.value === reading.context).label.toLowerCase();
    const target = glucoseTarget(reading.context);
    const base = status.level === "good"
      ? `Within your ${ctx} target (under ${target}).`
      : status.text === "Low"
        ? "This is low. Eat or drink something sugary now and recheck in 15 minutes."
        : `Above your ${ctx} target (under ${target}).`;
    const last3 = history.slice(0, 3).map((r) => r.value);
    if (last3.length === 3 && reading.value < Math.min(...last3)) return `${base} Nice — that’s lower than your last three readings.`;
    return base;
  }
  if (reading.type === "bp") {
    if (status.level === "bad") return "This is very high. Sit quietly for 5 minutes and recheck. If it stays this high or you feel unwell, get help now.";
    return status.level === "good" ? "Normal range (under 130/80)." : `${status.text} — target is under 130/80.`;
  }
  return status.text === "First reading" ? "Your first weight reading." : `${status.text} since your last reading.`;
}

export default function LogReadingScreen() {
  const { readings, saveReading, apiError } = usePatient();
  const navigate = useNavigate();
  const [type, setType] = useState("glucose");
  const [entry, setEntry] = useState("");
  const [context, setContext] = useState("after-meal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reading = toReading(type, entry, context);
  const history = readings.filter((r) => r.type === type);

  const switchType = (t) => { setType(t); setEntry(""); setError(""); };

  const press = (key) => {
    setError("");
    if (key === "⌫") return setEntry((e) => e.slice(0, -1));
    setEntry((e) => {
      // On BP the "." key acts as the systolic/diastolic separator.
      const ch = key === "." && type === "bp" ? "/" : key;
      if (e.length >= MAX_LEN[type]) return e;
      if (ch === "." && (type === "glucose" || e.includes(".") || !e)) return e;
      if (ch === "/" && (e.includes("/") || e.length < 2)) return e;
      return e + ch;
    });
  };

  const save = async () => {
    if (!reading) return setError(type === "bp" ? "Enter both numbers, e.g. 128/82." : "Enter a value first.");
    setSaving(true);
    setError("");
    try {
      await saveReading(reading);
      navigate("/app/health");
    } catch (err) {
      setError(apiError(err));
      setSaving(false);
    }
  };

  const unit = READING_TYPES[type].unit;

  return (
    <>
      <TopBar back="/app/health" backLabel="Cancel" title="Log a reading" />
      <div className="flex-1 overflow-y-auto p-[22px] flex flex-col gap-[22px]">
        <div role="tablist" className="grid grid-cols-3 border border-line-strong rounded overflow-hidden text-sm">
          {Object.entries(READING_TYPES).map(([t, meta], i) => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              onClick={() => switchType(t)}
              className={`h-11 ${i ? "border-l border-line-strong" : ""} ${type === t ? "bg-ink text-paper font-medium" : ""}`}
            >
              {meta.short}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-1.5 py-7 border-b border-line" aria-live="polite">
          <span className={`font-serif text-[88px] leading-none ${entry ? "" : "text-line-strong"}`}>
            {entry || (type === "bp" ? "—/—" : "—")}
          </span>
          <span className="font-mono text-xs text-slate-500">
            {unit}{type === "bp" && " · use . for /"}
          </span>
        </div>

        {type === "glucose" && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-slate-600">When</span>
            <div className="flex gap-2 flex-wrap">
              {GLUCOSE_CONTEXTS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setContext(c.value)}
                  aria-pressed={context === c.value}
                  className={`h-10 px-3.5 rounded-full text-sm ${context === c.value ? "bg-ink text-paper" : "border border-line-strong"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {reading && (
          <div className="px-3.5 py-3 bg-surface border border-line rounded text-[13px] leading-normal text-slate-600">
            {feedback(reading, history)}
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>

        <div className="mt-auto grid grid-cols-3 gap-px bg-line border border-line rounded overflow-hidden font-mono text-xl">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              aria-label={k === "⌫" ? "Delete" : k === "." && type === "bp" ? "Slash" : k}
              disabled={k === "." && type === "glucose"}
              className="h-[52px] grid place-items-center bg-surface active:bg-sunken disabled:text-line-strong"
            >
              {k === "." && type === "bp" ? "/" : k}
            </button>
          ))}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 h-[50px] rounded bg-ink text-paper text-[15px] font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save reading"}
        </button>
      </div>
    </>
  );
}
