import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { AUTH_KEY, store, getErrorMessage } from '../api/axios';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

/** Where each kind of staff member lands after logging in. */
export const HOME_PATH = { admin: '/admin', driver: '/driver' };
export const LOGIN_PATH = { admin: '/admin/login', driver: '/driver/login' };

function readSaved() {
  try {
    const saved = JSON.parse(store.get(AUTH_KEY) || 'null');
    return saved && saved.token && saved.role ? { token: saved.token, role: saved.role, user: null } : null;
  } catch {
    return null;
  }
}

/**
 * Staff login state (admins and drivers). Customers never log in.
 * Only the token and role are kept in the browser; the profile is fetched again on every page load.
 */
export function AuthProvider({ children }) {
  const toast = useToast();
  const [auth, setAuth] = useState(readSaved);
  const [loading, setLoading] = useState(() => Boolean(readSaved()));

  const logout = useCallback(() => {
    store.remove(AUTH_KEY);
    setAuth(null);
  }, []);

  /** Logs in. Resolves to { token, role, user } or throws an error whose message can be shown as is. */
  const login = useCallback(async (role, username, password) => {
    const res = await api.post(`/auth/${role}/login`, { username: username.trim(), password });
    const { token, user } = res.data.data;
    store.set(AUTH_KEY, JSON.stringify({ token, role }));
    const next = { token, role, user };
    setAuth(next);
    return next;
  }, []);

  // On page load: confirm the saved token still works and load the profile
  useEffect(() => {
    if (!auth || auth.user) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    api
      .get('/auth/me')
      .then((res) => {
        if (!cancelled) setAuth((a) => (a ? { ...a, user: res.data.data.user } : a));
      })
      .catch((err) => {
        // A 401 is handled by the 'vba:unauthorized' listener below. Any other failure (offline, server asleep)
        // keeps the person logged in, so a slow server does not throw them out.
        if (!cancelled && err.response && err.response.status !== 401) toast.error(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth && auth.token]);

  // The API client fires this when the server says the token is no longer valid
  useEffect(() => {
    const onUnauthorized = () => {
      if (!store.get(AUTH_KEY)) return;
      logout();
      toast.error('Your session ended. Please log in again.');
    };
    window.addEventListener('vba:unauthorized', onUnauthorized);
    return () => window.removeEventListener('vba:unauthorized', onUnauthorized);
  }, [logout, toast]);

  const setUser = useCallback((user) => setAuth((a) => (a ? { ...a, user } : a)), []);

  const value = useMemo(
    () => ({
      token: auth ? auth.token : null,
      role: auth ? auth.role : null,
      user: auth ? auth.user : null,
      isAdmin: auth ? auth.role === 'admin' : false,
      isDriver: auth ? auth.role === 'driver' : false,
      loading,
      login,
      logout,
      setUser,
    }),
    [auth, loading, login, logout, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
