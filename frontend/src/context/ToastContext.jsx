import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const ToastContext = createContext(null);

const DEFAULT_MS = { success: 4000, info: 5000, error: 7000, alert: 12000 };

/**
 * Small pop-up messages. Must sit inside the router, because a toast can link to a page.
 *   const toast = useToast();
 *   toast.success('Saved'); toast.error('Could not save'); toast.info('...');
 *   toast.alert('New request #123', { to: '/admin/requests' })   // stays longer, can link somewhere
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message, options = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, message, to: options.to }]); // keep at most 4 on screen
      timers.current.set(id, setTimeout(() => dismiss(id), options.duration ?? DEFAULT_MS[type] ?? 5000));
      return id;
    },
    [dismiss]
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const api = useMemo(
    () => ({
      success: (m, o) => push('success', m, o),
      error: (m, o) => push('error', m, o),
      info: (m, o) => push('info', m, o),
      alert: (m, o) => push('alert', m, o),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' || t.type === 'alert' ? 'alert' : 'status'}>
            <span className="toast-text">
              {t.to ? <Link to={t.to} onClick={() => dismiss(t.id)}>{t.message}</Link> : t.message}
            </span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss message">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
