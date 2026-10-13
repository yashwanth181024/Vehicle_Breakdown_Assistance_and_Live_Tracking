import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5055/api').replace(/\/$/, '');
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_URL.replace(/\/api$/, '')).replace(/\/$/, '');

/** Turns a server path such as /uploads/documents/a.jpg into a full URL the browser can load. */
export const assetUrl = (path) => (!path ? '' : /^https?:/i.test(path) ? path : `${SOCKET_URL}${path}`);

// ---------- Safe browser storage (private windows and blocked cookies can make it throw) ----------
export const store = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

export const AUTH_KEY = 'vba_auth';
const BOOKING_KEY = 'vba_booking';

export function getToken() {
  try {
    const saved = JSON.parse(store.get(AUTH_KEY) || 'null');
    return saved && saved.token ? saved.token : null;
  } catch {
    return null;
  }
}

// ---------- The customer has no account: remember their last booking on this device ----------
export const rememberBooking = ({ bookingNumber, phone }) => store.set(BOOKING_KEY, JSON.stringify({ bookingNumber, phone }));
export const forgetBooking = () => store.remove(BOOKING_KEY);
export function getRememberedBooking() {
  try {
    const b = JSON.parse(store.get(BOOKING_KEY) || 'null');
    return b && b.bookingNumber && b.phone ? b : null;
  } catch {
    return null;
  }
}

// ---------- Axios instance ----------
const api = axios.create({ baseURL: API_URL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** A message that is safe to show to a person, whatever went wrong. */
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err && err.userMessage) return err.userMessage;
  if (err && err.response && err.response.data && err.response.data.message) return err.response.data.message;
  if (err && err.code === 'ECONNABORTED') return 'The server took too long to answer. Please try again.';
  if (err && err.request && !err.response) return 'Cannot reach the server. Check your internet connection.';
  return fallback;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    err.userMessage = getErrorMessage({ ...err, userMessage: undefined });
    const url = (err.config && err.config.url) || '';
    // An expired or revoked staff login: tell AuthContext to sign out. Login attempts themselves are not "expired".
    if (err.response && err.response.status === 401 && getToken() && !/\/auth\/(admin|driver)\/login/.test(url)) {
      window.dispatchEvent(new Event('vba:unauthorized'));
    }
    return Promise.reject(err);
  }
);

/** The backend wraps every answer as { success, data }. This returns just the data. */
export const unwrap = (res) => (res && res.data ? res.data.data : undefined);

export default api;
