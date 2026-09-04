import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../lib/api';

/**
 * Who is signed in, and the API health signal the whole product reads.
 * The token is restored on boot; an expired one is dropped quietly so the
 * visitor lands on the landing page rather than an error screen.
 */
const SessionCtx = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [health, setHealth] = useState(null);

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) {
      setReady(true);
      return null;
    }
    try {
      const data = await api.auth.me();
      const found = data?.user || data || null;
      setUser(found);
      return found;
    } catch {
      tokenStore.set('');
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    loadMe();
    let alive = true;
    const probe = () => api.health().then((h) => alive && setHealth(h)).catch(() => alive && setHealth({ ok: false, database: 'unavailable' }));
    probe();
    const every = setInterval(probe, 30000);
    return () => {
      alive = false;
      clearInterval(every);
    };
  }, [loadMe]);

  const adopt = useCallback((payload) => {
    const found = payload?.user || null;
    if (payload?.token) tokenStore.set(payload.token);
    setUser(found);
    return found;
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      health,
      isAuthed: Boolean(user),
      async signIn(email, password) {
        return adopt(await api.auth.login(email, password));
      },
      async signUp(input) {
        return adopt(await api.auth.signup(input));
      },
      async signInDemo() {
        return adopt(await api.auth.demo());
      },
      signOut() {
        tokenStore.set('');
        setUser(null);
      },
      async updateProfile(patch) {
        const next = await api.auth.updateProfile(patch);
        setUser(next?.user || next);
        return next?.user || next;
      },
      async changePassword(current, next) {
        return api.auth.changePassword(current, next);
      },
      async deleteAccount() {
        await api.auth.removeAccount();
        tokenStore.set('');
        setUser(null);
      },
      refresh: loadMe,
    }),
    [user, ready, health, adopt, loadMe],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
