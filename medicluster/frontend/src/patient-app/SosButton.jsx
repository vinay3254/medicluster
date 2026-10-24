import React, { useRef, useState, useEffect } from "react";
const HOLD_MS = 3000;
export default function SosButton({ onTrigger, disabled }) {
  const [progress, setProgress] = useState(0);
  const start = useRef(null);
  const frame = useRef(null);

  const stop = () => {
    cancelAnimationFrame(frame.current);
    start.current = null;
    setProgress(0);
  };

  const begin = () => {
    if (disabled || start.current) return;
    start.current = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start.current) / HOLD_MS, 1);
      setProgress(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else { stop(); onTrigger(); }
    };
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const holdKey = (e) => (e.key === " " || e.key === "Enter") && !e.repeat;
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if (holdKey(e)) { e.preventDefault(); begin(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") stop(); }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="SOS. Press and hold for 3 seconds to call an ambulance"
      className="relative w-[200px] h-[200px] rounded-full bg-red-500 text-white flex flex-col items-center justify-center gap-1 shadow-[0_0_0_14px_#f1d9d6] select-none touch-none disabled:opacity-60"
      style={{ WebkitTouchCallout: "none" }}
    >
      <svg className="absolute -inset-[14px] w-[228px] h-[228px] -rotate-90 pointer-events-none" viewBox="0 0 228 228" aria-hidden="true">
        <circle cx="114" cy="114" r="107" fill="none" stroke="#a82f2a" strokeWidth="14"
          strokeDasharray={2 * Math.PI * 107} strokeDashoffset={(1 - progress) * 2 * Math.PI * 107} />
      </svg>
      <span className="font-serif text-[40px] leading-none">SOS</span>
      <span className="text-[13px]">{progress > 0 ? "Keep holding…" : "Hold for 3 seconds"}</span>
    </button>
  );
}

