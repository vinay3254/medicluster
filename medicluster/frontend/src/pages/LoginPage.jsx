import { useState } from "react";
import { Eye, EyeOff, ArrowUpRight } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";
import { useInstallPrompt } from "../installPrompt";
import "../auth/auth-artwork.css";

export function Field({ label, aside, id, ...input }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <label htmlFor={id} className="text-slate-600">{label}</label>
        {aside}
      </div>
      <input
        id={id}
        {...input}
        className="h-11 px-3 rounded-[3px] border border-line-strong bg-surface text-sm text-ink outline-none focus:border-ink focus:shadow-[inset_0_0_0_0.5px_#15171a]"
      />
    </div>
  );
}

const linkCls = "mc-auth-link";
const primaryBtn = "mc-auth-submit";

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("signin"); // signin | request
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const install = useInstallPrompt();

  if (user) return <Navigate to={user.onboarded ? location.state?.from || "/" : "/onboarding"} replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = mode === "signin"
        ? await login(form.email, form.password)
        : await register(form.name, form.email, form.password);
      navigate(u.onboarded ? location.state?.from || "/" : "/onboarding", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't reach MediCluster. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next) => (e) => {
    e.preventDefault();
    setMode(next);
    setError(null);
    setNotice(null);
    setShowPassword(false);
  };

  return (
    <div className="mc-auth-shell min-h-screen text-ink" data-auth-mode={mode}>
      <div className="mc-auth-layout">
        <aside className="mc-auth-botanical" aria-label="MediCluster care illustration">
          <img src="/images/auth-botanical-dna.webp" alt="" width="1000" height="1250" fetchPriority="high" decoding="async" />
          <span className="mc-auth-chip mc-auth-chip-one">Insights<i aria-hidden="true">+</i></span>
          <span className="mc-auth-chip mc-auth-chip-two">Wellness<i aria-hidden="true">+</i></span>
          <span className="mc-auth-chip mc-auth-chip-three"><i aria-hidden="true">+</i>Care</span>
        </aside>
        <main>
          <div className="mc-auth-topline"><a className="mc-auth-brand" href="/download" aria-label="MediCluster home"><Logo /><span>MediCluster</span><i aria-hidden="true" /></a><a className="mc-auth-back" href="/download" aria-label="Back to MediCluster apps"><ArrowUpRight size={19} aria-hidden="true" /></a></div>
          <form onSubmit={submit} className="mc-auth-form" noValidate>
            <div className="mc-auth-intro">
              <p className="mc-auth-eyebrow">YOUR CLINICAL WORKSPACE</p>
              <h1>{mode === "signin" ? "Welcome back" : "Request access"}</h1>
              <p>{mode === "signin" ? "Use your hospital account." : "Use your approved hospital email to get started."}</p>
            </div>
            {mode === "signin" && <>
              <button type="button" className="mc-auth-sso" disabled title="Single sign-on isn't configured for this deployment" aria-describedby="hospital-sso-status">Continue with hospital SSO</button>
              <p id="hospital-sso-status" className="mc-auth-sso-status">Hospital SSO isn’t configured yet.</p>
              <div className="mc-auth-divider"><span />OR<span /></div>
            </>}
            {mode === "request" && <Field id="name" label="Full name" placeholder="Your full name" autoComplete="name" value={form.name} onChange={set("name")} required />}
            <Field id="email" type="email" label="Work email" placeholder="you@hospital.com" autoComplete="email" value={form.email} onChange={set("email")} required />
            <div className="mc-auth-password">
              <Field id="password" type={showPassword ? "text" : "password"} label="Password" placeholder="Enter your password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "request" ? 8 : undefined} value={form.password} onChange={set("password")} required />
              <button className="mc-auth-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
            </div>
            {mode === "signin" ? <div className="mc-auth-help"><span>Use your hospital account.</span><a href="#" className={linkCls} onClick={e => { e.preventDefault(); setNotice("Ask your MediCluster administrator to reset your password."); }}>Forgot password?</a></div> : <p className="mc-auth-password-hint">Use at least 8 characters.</p>}
            {error && <p role="alert" className="mc-auth-error">{error}</p>}
            {notice && <p role="status" className="mc-auth-notice">{notice}</p>}
            <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowUpRight size={18} aria-hidden="true" /></button>
            <p className="mc-auth-switch">{mode === "signin" ? <>New to MediCluster? <a href="#" className={linkCls} onClick={switchMode("request")}>Request access</a></> : <>Already have an account? <a href="#" className={linkCls} onClick={switchMode("signin")}>Sign in</a></>}</p>
            {install && <button type="button" onClick={install} className="mc-auth-install">Install MediCluster app</button>}
          </form>
          <div className="mc-auth-footnote"><span>For every part of care.</span><a href="/download">Explore the apps<ArrowUpRight size={14} aria-hidden="true" /></a></div>
        </main>
      </div>
    </div>
  );
}
