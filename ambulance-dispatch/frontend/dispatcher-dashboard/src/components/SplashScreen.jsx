import { useCallback, useEffect, useRef, useState } from "react";
import "./splash-screen.css";
import { EarthSplashRenderer } from "./earth-splash";

const HOLD_MS = 900;
const FALLBACK_MS = 6000;
const FADE_MS = 500;

/** Keep startup scoped to the document, with the app loading behind the intro. */
export function AppStartup({ children, tagline }) {
  const [showSplash, setShowSplash] = useState(true);
  const finishSplash = useCallback(() => setShowSplash(false), []);
  const setContent = useCallback((node) => {
    if (node) node.inert = showSplash;
  }, [showSplash]);

  return (
    <>
      <div id="app-content" className="mc-startup-content" ref={setContent} aria-hidden={showSplash || undefined}>
        {children}
      </div>
      {showSplash && <SplashScreen onDone={finishSplash} tagline={tagline} />}
    </>
  );
}

export default function SplashScreen({ onDone, tagline = "Patient risk stratification at scale" }) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [landed, setLanded] = useState(reduced);
  const [leaving, setLeaving] = useState(false);
  const splashRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const renderer = new EarthSplashRenderer(canvasRef.current, reduced);
    const resize = () => {
      renderer.resize(window.innerWidth, window.innerHeight);
      renderer.update(0);
    };
    resize();
    window.addEventListener("resize", resize);
    let frame;
    let previous = performance.now();
    let stopped = false;
    const draw = (now) => {
      if (stopped) return;
      renderer.update(Math.min((now - previous) / 1000, 0.1));
      previous = now;
      if (renderer.animationTime >= 3) setLanded(true);
      frame = requestAnimationFrame(draw);
    };
    if (!reduced) frame = requestAnimationFrame(draw);
    document.fonts?.load('400 68px WorkspaceSans').then(() => {
      if (!stopped && reduced) renderer.update(0);
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    };
  }, [reduced]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    splashRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), landed ? HOLD_MS : FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [landed]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  useEffect(() => {
    const skip = (e) => {
      if (["Escape", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        setLeaving(true);
      }
      if (e.key === "Tab") {
        e.preventDefault();
        splashRef.current?.focus();
      }
    };
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, []);

  return (
    <div ref={splashRef} tabIndex={-1} className="mc-splash" data-leaving={leaving} data-reduced={reduced} onClick={() => setLeaving(true)}
      role="dialog" aria-modal="true" aria-label="Starting MediCluster">
      <canvas ref={canvasRef} className="mc-splash-canvas" role="img" aria-label="MediCluster" />
      <span className="mc-splash-dispatch-label">{tagline}</span>
      <button type="button" className="mc-splash-skip" onClick={() => setLeaving(true)}>Skip intro</button>
    </div>
  );
}
