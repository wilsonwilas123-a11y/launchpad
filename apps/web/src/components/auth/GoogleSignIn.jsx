import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../context/Session';
import { api } from '../../lib/api';
import { loadGoogleIdentity, useGoogleAuth } from '../../lib/googleAuth';
import googleButton from '../../../../../assets/img/googleicon.png'; // ← match your filename

export function GoogleMark({ className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false" className={className}>
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 3.04-2.06 5.62-4.39 7.35v6.11h7.11c4.16-3.83 6.56-9.47 6.56-17.47z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-3.58c-1.92 1.33-4.48 2.11-7.45 2.11-5.82 0-10.75-3.99-12.51-9.36L4.2 36.19C7.84 41.98 15.35 46 24 46z" />
      <path fill="#FBBC05" d="M11.49 29.84c-.45-1.32-.71-2.73-.71-4.19s.26-2.87.71-4.19L4.2 11.81C2.73 14.49 1.89 17.56 1.89 20.81s.84 6.32 2.31 9z" />
      <path fill="#EA4335" d="M24 9.96c3.32 0 6.3 1.14 8.65 3.39l6.48-6.48C34.9 3.63 29.92 1.62 24 1.62 15.35 1.62 7.84 5.64 4.2 11.43l7.29 5.63C13.25 13.95 18.18 9.96 24 9.96z" />
    </svg>
  );
}

export default function GoogleSignIn({ intent = 'signin', next = '/dashboard', onSignedIn }) {
  const session = useSession();
  const navigate = useNavigate();
  const { state, clientId, recheck } = useGoogleAuth();
  const hostRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gis, setGis] = useState(null);

  useEffect(() => {
    if (state !== 'available') return undefined;
    let alive = true;
    loadGoogleIdentity()
      .then((api_) => alive && setGis(api_))
      .catch(() => alive && setGis(null));
    return () => { alive = false; };
  }, [state]);

  const finish = useCallback(async (credential) => {
    setBusy(true);
    setError('');
    try {
      const user = await session.signInWithGoogle(credential);
      if (onSignedIn) onSignedIn(user);
      else navigate(user ? next : '/sign-in', { replace: true });
    } catch (e) {
      setError(e.message || 'Google sign-in did not complete.');
    } finally {
      setBusy(false);
    }
  }, [navigate, next, onSignedIn, session]);

  useEffect(() => {
    if (!gis || state !== 'available' || !hostRef.current) return;
    try {
      gis.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        auto_select: false,
        callback: (response) => response?.credential && finish(response.credential),
      });
      hostRef.current.innerHTML = '';
      gis.renderButton(hostRef.current, { type: 'standard', size: 'large', width: 300 });
      if (!hostRef.current.childElementCount) throw new Error('Google drew nothing.');
    } catch (err) {
      console.warn('[launchpad] Google button unavailable:', err?.message || err);
      setGis(null);
    }
  }, [gis, state, clientId, finish]);

  const handleClick = () => {
    setError('');
    const hidden = hostRef.current?.querySelector('div[role="button"]');
    if (gis && hidden) { hidden.click(); return; }
    setBusy(true);
    window.location.assign(api.auth.googleStartUrl(next));
  };

  // ── loading skeleton
  if (state === 'checking') {
    return <div aria-hidden className="mt-6 h-11 w-full animate-pulse rounded-full bg-white/[0.04]" />;
  }

  if (state === 'unreachable') return null;

  // ── not configured — greyed picture
  if (state === 'unconfigured') {
    return (
      <div className="mt-6 flex flex-col items-center gap-2">
        <img
          src={googleButton}
          alt="Sign in with Google — not configured"
          className="h-11 w-auto select-none opacity-30 grayscale"
          draggable={false}
        />
        <p className="text-center text-[13.5px] leading-relaxed text-ink-400">
          Needs <span className="font-mono text-ink-300">GOOGLE_CLIENT_ID</span> in{' '}
          <span className="font-mono text-ink-300">apps/api/.env</span>.
        </p>
      </div>
    );
  }

  // ── hidden real Google button (forwards clicks from our picture)
  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      {/* Google's real invisible button — only used to open the popup */}
      <div
        ref={hostRef}
        aria-hidden
        className="pointer-events-none absolute overflow-hidden opacity-0"
        style={{ width: 1, height: 1 }}
      />

      {/* Our picture button — compact, centred, 44 px tall */}
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={intent === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
        className="rounded-full transition hover:opacity-90 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <img
          src={googleButton}
          alt=""
          className="block h-11 w-auto select-none"
          draggable={false}
        />
      </button>

      {error ? (
        <p role="alert" className="w-full rounded-tile border border-red-400/25 bg-red-500/10 px-3 py-2 text-[14.5px] text-red-100">
          {error}{' '}
          <button type="button" onClick={recheck} className="link-quiet underline">Try again</button>
        </p>
      ) : null}
    </div>
  );
}