import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GIS_TIMEOUT_MS = 12000;

let gisPromise = null;

/**
 * Loads Google's own sign-in script once per page.
 *
 * Resolving to `null` is a normal outcome, not an error: on a machine with no
 * route to google.com (or a preview with no network at all) the caller falls
 * back to the authorization-code flow, or to the email form.
 */
export function loadGoogleIdentity() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), GIS_TIMEOUT_MS);
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    // Google's button renders inside its own frame; nothing here is required
    // beyond the client id, which is public by design.
    script.onload = () => finish(window.google?.accounts?.id || null);
    script.onerror = () => {
      script.remove();
      finish(null);
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

/**
 * Reads `/api/auth/google/status` and keeps whatever the sign-in screen needs:
 * whether Google is configured on this API at all, the public client id, and
 * whether the server also has a secret (which is what makes the redirect flow
 * possible). A failed request simply means "no Google here".
 */
export function useGoogleAuth() {
  const [status, setStatus] = useState({ state: 'checking', enabled: false, redirect: false, clientId: '' });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let timer;
    api.auth
      .googleStatus()
      .then((data) => {
        if (!alive.current) return;
        setStatus({
          state: data?.enabled ? 'available' : 'unconfigured',
          enabled: Boolean(data?.enabled),
          redirect: Boolean(data?.redirect),
          clientId: data?.clientId || '',
        });
      })
      .catch(() => {
        if (alive.current) setStatus({ state: 'unreachable', enabled: false, redirect: false, clientId: '' });
      });
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, []);

  const recheck = useCallback(() => {
    setStatus({ state: 'checking', enabled: false, redirect: false, clientId: '' });
    api.auth
      .googleStatus()
      .then((data) => alive.current && setStatus({
        state: data?.enabled ? 'available' : 'unconfigured',
        enabled: Boolean(data?.enabled),
        redirect: Boolean(data?.redirect),
        clientId: data?.clientId || '',
      }))
      .catch(() => alive.current && setStatus({ state: 'unreachable', enabled: false, redirect: false, clientId: '' }));
  }, []);

  return { ...status, recheck };
}
