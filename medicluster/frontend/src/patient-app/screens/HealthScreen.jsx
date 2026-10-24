import React from "react";
import { Link } from "react-router-dom";
import { usePatient, TabBar } from "../PatientApp";
import { Body, Eyebrow, ListHeader, ErrorNote } from "../ui";
import { READING_TYPES, LEVEL_BAR, LEVEL_TEXT, TIERS, assess, formatValue, riskFromReadings } from "../health";
import { RISK_COLORS } from "../../theme";

const TIER_TEXT = { Low: "text-emerald-700", Moderate: "text-amber-700", High: "text-orange-600", Critical: "text-red-600" };

function Sparkline({ values, lastLevel }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  // Keep a visible floor so flat series still draw.
  const height = (v) => (max === min ? 60 : 30 + ((v - min) / (max - min)) * 70);
  return (
    <div className="flex items-end gap-[3px] h-6" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-1.5 ${i === values.length - 1 ? LEVEL_BAR[lastLevel] : "bg-line-strong"}`}
          style={{ height: `${height(v)}%` }}
        />
      ))}
    </div>
  );
}

export default function HealthScreen() {
  const { readings, error } = usePatient();
  const risk = riskFromReadings(readings);
  const latestAt = readings[0]?.takenAt;

  const rows = Object.entries(READING_TYPES).map(([type, meta]) => {
    const ofType = readings.filter((r) => r.type === type); // newest first
    if (!ofType.length) return { type, meta, latest: null };
    const latest = ofType[0];
    return {
      type,
      meta,
      latest,
      status: assess(latest, ofType[1]),
      series: ofType.slice(0, 5).reverse().map((r) => r.value),
    };
  });

  return (
    <>
      <Body className="px-[22px] pt-[18px] pb-6 flex flex-col gap-[22px]">
        <h1 className="m-0 font-serif text-[30px] tracking-[-0.01em]">My health</h1>
        <ErrorNote>{error}</ErrorNote>

        <div className="mc-patient-card flex flex-col gap-2.5" data-tone="sage">
          <div className="flex justify-between items-center">
            <Eyebrow>YOUR RISK LEVEL</Eyebrow>
            {risk && (
              <span className={`text-xs font-semibold px-2 py-0.5 border border-current rounded-sm ${TIER_TEXT[risk.tier]}`}>
                {risk.tier}
              </span>
            )}
          </div>
          <div className="flex gap-0.5 h-2" role="img" aria-label={risk ? `Risk level ${risk.tier} of 4` : "No risk level yet"}>
            {TIERS.map((t, i) => (
              <div key={t} className="flex-1" style={{ background: risk?.index === i ? RISK_COLORS[t] : "#d7dacf" }} />
            ))}
          </div>
          <span className="text-sm leading-normal text-slate-600">
            {risk ? risk.advice : "Log your blood sugar or blood pressure to see your risk level."}
          </span>
        </div>

        <div className="flex flex-col">
          <ListHeader
            title="Latest readings"
            meta={latestAt && new Date(latestAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          />
          {rows.map(({ type, meta, latest, status, series }) => (
            <div key={type} className="mc-reading-card grid grid-cols-[1fr_auto_50px] gap-3 items-center min-h-14">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">{meta.label}</span>
                <span className={`text-xs ${latest ? LEVEL_TEXT[status.level] : "text-slate-500"}`}>
                  {latest ? status.text : "No readings yet"}
                </span>
              </div>
              <span className="font-mono text-[17px]">
                {latest ? formatValue(latest) : "—"}
                {latest && <span className="sr-only"> {meta.unit}</span>}
              </span>
              {latest ? <Sparkline values={series} lastLevel={status.level} /> : <span />}
            </div>
          ))}
        </div>

        <Link
          to="/app/health/log"
          className="mc-card-cta h-12 text-[15px] font-medium"
        >
          + Log a reading
        </Link>
        <p className="m-0 text-[11px] text-slate-500">
          Based on your own latest readings. Not a diagnosis — your doctor sees the full picture.
        </p>
      </Body>
      <TabBar />
    </>
  );
}
