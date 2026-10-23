import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './dispatch-auth.css';

const DEMO_ACCOUNTS = [
  {
    label: 'Dispatcher / CAD Operator',
    email: 'dispatcher@cad.emergency.in',
    role: 'DISPATCHER',
    desc: 'Full Command Center, AI dispatching, live fleet overview',
  },
  {
    label: 'Driver: Alpha-1 (ALS)',
    email: 'driver.alpha1@cad.emergency.in',
    role: 'DRIVER',
    desc: 'Locked to Alpha-1 vehicle · Mission status & turn-by-turn HUD',
  },
  {
    label: 'Driver: Charlie-3 (ALS)',
    email: 'driver.charlie3@cad.emergency.in',
    role: 'DRIVER',
    desc: 'Locked to Charlie-3 vehicle · Patient vitals & hospital selector',
  },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [notice, setNotice] = useState(null);

  const { signInWithEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await signInWithEmail(email.trim(), password);

      // Determine appropriate redirect destination
      if (email.includes('driver') || res.user?.user_metadata?.role === 'DRIVER') {
        navigate('/driver', { replace: true });
      } else {
        navigate(from === '/login' ? '/' : from, { replace: true });
      }
    } catch (err) {
      console.error('[LoginPage] Authentication failed:', err);
      setErrorMsg(err.message || 'Invalid email or password. Check credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectDemo = (demo) => {
    setEmail(demo.email);
    setPassword('Emergency@123');
    setErrorMsg(null);
  };

  return (
    <div className="dc-auth-shell">
      <div className="dc-auth-layout">
        <aside className="dc-auth-botanical" aria-label="Sculpted copper and glass dispatch artwork">
          <img src="/images/auth-ribbons.webp" alt="" fetchPriority="high" decoding="async" />
          <span className="dc-auth-chip dc-auth-chip-one">Dispatch<i aria-hidden="true">+</i></span>
          <span className="dc-auth-chip dc-auth-chip-two">Response<i aria-hidden="true">+</i></span>
          <span className="dc-auth-chip dc-auth-chip-three"><i aria-hidden="true">+</i>Care</span>
        </aside>
        <main>
          <div className="dc-auth-topline">
            <a className="dc-auth-brand" href="#/login" aria-label="MediCluster Dispatch home">
              <svg viewBox="0 0 18 18" aria-hidden="true"><rect x="1" y="1" width="6" height="6" fill="currentColor" /><rect x="11" y="1" width="6" height="6" fill="currentColor" /><rect x="1" y="11" width="6" height="6" fill="currentColor" /><rect x="11" y="11" width="6" height="6" /></svg>
              <span>MediCluster</span><i aria-hidden="true" />
            </a>
            <a className="dc-auth-back" href="#/driver/login" aria-label="Open crew sign-in">↗</a>
          </div>
          <form onSubmit={handleLogin} className="dc-auth-form" noValidate>
            <div className="dc-auth-intro">
              <p className="dc-auth-eyebrow">YOUR DISPATCH WORKSPACE</p>
              <h1>Welcome back</h1>
              <p>Use your dispatch centre account.</p>
            </div>
            <button type="button" className="dc-auth-sso" disabled title="Single sign-on isn't configured for this deployment" aria-describedby="dispatch-sso-status">Continue with hospital SSO</button>
            <p id="dispatch-sso-status" className="dc-auth-sso-status">Hospital SSO isn’t configured yet.</p>
            <div className="dc-auth-divider"><span />OR<span /></div>
            <div>
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" autoComplete="email" placeholder="operator@hospital.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="dc-auth-password">
              <label htmlFor="password">Password</label>
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
              <button className="dc-auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>
              </button>
            </div>
            <div className="dc-auth-help"><span>For authorised dispatch staff.</span><a className="dc-auth-link" href="#/login" onClick={e => { e.preventDefault(); setNotice('Ask your dispatch administrator to reset your password.'); }}>Forgot password?</a></div>
            {errorMsg && <p role="alert" className="dc-auth-error">{errorMsg}</p>}
            {notice && <p role="status" className="dc-auth-notice">{notice}</p>}
            <button type="submit" disabled={isSubmitting} className="dc-auth-submit">{isSubmitting ? 'Signing in…' : 'Sign in'}<span aria-hidden="true">↗</span></button>
            <p className="dc-auth-switch">New to MediCluster? <a href="#/login" className="dc-auth-link" onClick={e => { e.preventDefault(); setNotice('Contact your dispatch administrator to request an account for your centre.'); }}>Request access</a></p>
            {import.meta.env.DEV && <details className="dc-auth-demo"><summary>Demo accounts · development only</summary>{DEMO_ACCOUNTS.map(demo => <button key={demo.email} type="button" onClick={() => handleSelectDemo(demo)}>{demo.label}</button>)}</details>}
          </form>
          <div className="dc-auth-footnote"><span>Every second connects us.</span><a href="#/driver/login">Crew sign-in<span aria-hidden="true">↗</span></a></div>
        </main>
      </div>
    </div>
  );
}
