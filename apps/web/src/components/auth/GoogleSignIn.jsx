import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../context/Session';
import { api } from '../../lib/api';
import { loadGoogleIdentity, useGoogleAuth } from '../../lib/googleAuth';
import { Button } from '../ui/Button';

/** Google's four-colour mark, inline so there is nothing extra to download. */
export function GoogleMark({ className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false" className={className}>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 3.04-2.06 5.62-4.39 7.35v6.11h7.11c4.16-3.83 6.56-9.47 6.56-17.47z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-3.58c-1.92 1.33-4.48 2.11-7.45 2.11-5.82 0-10.75-3.99-12.51-9.36L4.2 36.19C7.84 41.98 15.35 46 24 46z"
      />
      <path fill="#FBBC05" d="M11.49 29.84c-.45-1.32-.71-2.73-.71-4.19s.26-2.87.71-4.19L4.2 11.81C2.73 14.49 1.89 17.56 1.89 20.81s.84 6.32 2.31 9z" />
      <path
        fill="#EA4335"
        d="M24 9.96c3.32 0 6.3 1.14 8.65 3.39l6.48-6.48C34.9 3.63 29.92 1.62 24 1.62 15.35 1.62 7.84 5.64 4.2 11.43l7.29 5.63C13.25 13.95 18.18 9.96 24 9.96z"
      />
    </svg>
  );
}

/**
 * "Continue with Google".
 *
 * Three honest states. Google is configured and reachable → Google's own
 * button, whose ID token we verify on the API before signing anybody in.
 * Configured but the script cannot load → the server-side redirect flow, which
 * needs no JavaScript from Google. Not configured → a greyed row that names the
 * variable to set, because a sign-in button that throws an error is worse than
 * an absent one, and a silently absent one is worse than an explained one.
 */
export default function GoogleSignIn({ intent = 'signin', next = '/dashboard', onSignedIn }) {
  const session = useSession();
  const navigate = useNavigate();
  const { state, redirect, clientId, recheck } = useGoogleAuth();
  const hostRef = useRef(null);
  const wrapRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gis, setGis] = useState(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (state !== 'available') return undefined;
    let alive = true;
    loadGoogleIdentity().then((api_) => alive && setGis(api_));
    return () => {
      alive = false;
    };
  }, [state]);

  // Google's button takes a pixel width, so it is measured from the column it
  // sits in — the same width the email form above it gets.
  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observe = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setWidth(Math.max(220, Math.min(400, Math.round(box.width))));
    });
    observe.observe(wrapRef.current);
    return () => observe.disconnect();
  }, [state]);

  const finish = useCallback(
    async (credential) => {
      setBusy(true);
      setError('');
      try {
        const user = await session.signInWithGoogle(credential);
        if (onSignedIn) onSignedIn(user);
        else navigate(user ? next : '/sign-in', { replace: true });
      } catch (e) {
        // The API already said why (expired token, unverified email, …).
        setError(e.message || 'Google sign-in did not complete.');
      } finally {
        setBusy(false);
      }
    },
    [navigate, next, onSignedIn, session],
  );

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
      gis.renderButton(hostRef.current, {
        theme: 'filled_black',
        size: 'large',
        // Google's own button, at its own 40px height — the one control in this
        // app we do not restyle, because their guidelines ask for exactly this.
        text: intent === 'signup' ? 'signup_with' : 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: width || undefined,
      });
      if (!hostRef.current.childElementCount) throw new Error('Google drew nothing.');
    } catch (error) {
      // A half-loaded Google must never take the sign-in page down with it: the
      // fallback below is a plain button that uses the server-side flow.
      console.warn('[launchpad] Google button unavailable:', error?.message || error);
      setGis(null);
    }
  }, [gis, state, clientId, intent, width, finish]);

  const goRedirectFlow = () => {
    setBusy(true);
    // A full-page navigation: Google sends the browser back to the API, the
    // API hands the session token to the app through the URL fragment.
    window.location.assign(api.auth.googleStartUrl(next));
  };

  if (state === 'checking') {
    return <div aria-hidden className="h-11 w-full animate-pulse rounded-full bg-white/[0.04]" />;
  }

  if (state === 'unreachable') return null;

  if (state === 'unconfigured') {
    return (
      <div className="mt-6">
        <div
          aria-disabled="true"
          title="Set GOOGLE_CLIENT_ID in apps/api/.env, restart the API, and this starts working."
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-dashed border-white/15 px-4 text-[15px] text-ink-400"
        >
          <GoogleMark className="h-[18px] w-[18px] opacity-45" />
          <span className="opacity-70">Continue with Google</span>
          <span className="micro ml-auto hidden opacity-70 min-[420px]:inline">not set up on this API</span>
        </div>
        <p className="mt-2 text-center text-[14px] leading-relaxed text-ink-400">
          Needs <span className="font-mono text-ink-300">GOOGLE_CLIENT_ID</span> in{' '}
          <span className="font-mono text-ink-300">apps/api/.env</span>. Email and the demo account work without it.
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="mt-6 flex min-w-0 flex-col gap-2">
      {/* Google draws its own button here when its script is reachable. */}
      <div ref={hostRef} className={gis ? 'flex min-w-0 justify-center' : 'hidden'} />
      {!gis ? (
        <Button variant="secondary" size="lg" className="w-full" onClick={goRedirectFlow} loading={busy}>
          <GoogleMark />
          Continue with Google
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-tile border border-red-400/25 bg-red-500/10 px-3 py-2 text-[14.5px] text-red-100">
          {error}{' '}
          <button type="button" onClick={recheck} className="link-quiet underline">
            Try again
          </button>
        </p>
      ) : null}
      {!redirect && !gis ? (
        <p className="text-center text-[13.5px] text-ink-400">Google could not be reached from here — sign in with email below.</p>
      ) : null}
    </div>
  );
}
