import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { forgetBooking, getErrorMessage, getRememberedBooking, rememberBooking } from '../api/axios';
import useSocket, { emitWithAck, useSocketEvent } from '../hooks/useSocket';
import { getTrackingUrl } from '../utils/booking';
import { useToast } from '../context/ToastContext';
import StatusTimeline from '../components/StatusTimeline';
import TrackingMap from '../components/TrackingMap';
import ChatBox from '../components/ChatBox';
import ShareLinkButton from '../components/ShareLinkButton';
import { CLOSED, cleanPhone, formatDateTime, isPhone, statusClass } from '../utils/format';
import { driverOf, isLive, parseBookingNumber, pickupPoint, pickupText, readRoute, toPoint } from '../utils/booking';

function LookupForm({ initialNumber, initialPhone, error, busy, onSubmit }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState(initialNumber || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [local, setLocal] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const num = parseBookingNumber(number);
    const p = cleanPhone(phone);
    if (!num) return setLocal(t('Enter your booking number (digits only).'));
    if (!isPhone(p) || p.length !== 10) return setLocal(t('Enter the 10-digit mobile number you booked with.'));
    setLocal('');
    onSubmit(num, p);
  };

  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <div className="page-head"><h1>{t('Track your booking')}</h1></div>
      <form className="card stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="t-number">{t('Booking number')}</label>
          <input id="t-number" type="text" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-phone">{t('Mobile number')}</label>
          <input id="t-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <span className="hint">{t('The number you gave when you booked.')}</span>
        </div>
        {(local || error) && <p className="notice notice-error" role="alert">{local || error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('Looking…') : t('Track')}</button>
      </form>
    </div>
  );
}

function RatingForm({ bookingNumber, phone, existing, onDone }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (existing) {
    return <p>{t('You rated this service')} <strong>{existing} out of 5</strong>. {t(t('Thank you for your feedback.'))}</p>;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!stars) return setError(t('Tap a star to rate.'));
    setBusy(true);
    setError('');
    try {
      await api.post(`/bookings/${bookingNumber}/rating`, { phone, rating: stars, feedback: comment.trim() || undefined });
      toast.success(t('Thank you for your feedback.'));
      onDone(stars);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
      <div role="radiogroup" aria-label="Rating" className="row" style={{ gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setStars(n)} style={{ background: 'none', border: 0, fontSize: '2rem', lineHeight: 1, cursor: 'pointer', color: n <= stars ? 'var(--signal-strong, #e0a800)' : 'var(--line-strong)' }}>
            ★
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="r-comment">{t('Comment')} <span className="optional">({t('optional')})</span></label>
        <textarea id="r-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send rating')}</button>
    </form>
  );
}

export default function TrackBooking() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { socket, connected } = useSocket();

  // The phone number is read once, then removed from the address bar so it is not left in browser history
  const initial = useRef(null);
  if (initial.current === null) {
    const b = params.get('bookingNumber') || params.get('booking');
    const fromUrl = { bookingNumber: parseBookingNumber(b), phone: cleanPhone(params.get('phone')) };
    const saved = getRememberedBooking();
    if (fromUrl.bookingNumber && fromUrl.phone.length === 10) initial.current = fromUrl;
    else if (fromUrl.bookingNumber && saved && Number(saved.bookingNumber) === fromUrl.bookingNumber) initial.current = { bookingNumber: saved.bookingNumber, phone: saved.phone };
    else if (!b && saved) initial.current = { bookingNumber: Number(saved.bookingNumber), phone: saved.phone };
    else initial.current = { bookingNumber: fromUrl.bookingNumber, phone: fromUrl.phone };
  }

  const [key, setKey] = useState(initial.current.phone.length === 10 ? initial.current : null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(Boolean(key));
  const [lookupError, setLookupError] = useState('');
  const [route, setRoute] = useState(readRoute(null));
  const [driverPoint, setDriverPoint] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [myRating, setMyRating] = useState(null);
  const lastRoute = useRef(0);

  const load = useCallback(async (k, { quiet = false } = {}) => {
    if (!k) return;
    if (!quiet) setLoading(true);
    try {
      const res = await api.post('/bookings/track', { bookingNumber: k.bookingNumber, phone: k.phone });
      const d = res.data.data || {};
      const b = d.booking || d;
      setBooking({ ...b, timeline: b.timeline || d.timeline || b.statusHistory || [] });
      setLookupError('');
      rememberBooking(k);
      const dp = driverOf(b);
      if (dp && dp.point) setDriverPoint(dp.point);
    } catch (err) {
      if (!quiet) {
        setLookupError(err.response && err.response.status === 404 ? t('No booking matches that number and phone. Please check both.') : getErrorMessage(err));
        setBooking(null);
        setKey(null);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) {
      load(key);
      navigate(getTrackingUrl(key.bookingNumber, key.phone), { replace: true });
    }
  }, [key, load, navigate]);

  // Join the booking's live room (again after every reconnect)
  useEffect(() => {
    if (!socket || !connected || !key) return;
    emitWithAck(socket, 'booking:join', { bookingNumber: key.bookingNumber, phone: key.phone });
  }, [socket, connected, key]);

  const refresh = useCallback(() => load(key, { quiet: true }), [key, load]);

  const [notifPerm, setNotifPerm] = useState(Notification.permission);
  const requestNotifications = () => {
    Notification.requestPermission().then(p => setNotifPerm(p)).catch(() => {});
  };

  const notifyUser = (title, body) => {
    if (document.hidden && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  useSocketEvent('booking:status', (d) => { 
    if (!d || !key || d.bookingNumber == null || Number(d.bookingNumber) === key.bookingNumber) {
      if (d && d.status) notifyUser('Booking Update', `Status changed to: ${d.status}`);
      refresh(); 
    }
  });
  useSocketEvent('booking:updated', (d) => { 
    if (!d || !key || d.bookingNumber == null || Number(d.bookingNumber) === key.bookingNumber) {
      if (d && d.status) notifyUser('Booking Update', `Status changed to: ${d.status}`);
      refresh(); 
    }
  });

  const onDriverMove = (d) => {
    if (!d || !key || (d.bookingNumber != null && Number(d.bookingNumber) !== key.bookingNumber)) return;
    const p = toPoint(d.location) || toPoint(d);
    if (p) setDriverPoint(p);
  };
  useSocketEvent('driver:location', onDriverMove);
  useSocketEvent('driver:moved', onDriverMove);

  const status = booking && booking.status;
  const live = isLive(status);

  // Route and arrival time while a driver is on the job, refreshed every 20 s and not more often than every 8 s
  const loadRoute = useCallback(async () => {
    if (!key) return;
    lastRoute.current = Date.now();
    try {
      const res = await api.post('/route/booking', { bookingNumber: key.bookingNumber, phone: key.phone });
      const r = readRoute(res.data.data);
      setRoute(r);
      if (r.driver) setDriverPoint(r.driver);
    } catch { /* keep the last route; the map still shows the driver */ }
  }, [key]);

  useEffect(() => {
    if (!live) { setRoute(readRoute(null)); return undefined; }
    loadRoute();
    const t = setInterval(loadRoute, 20000);
    return () => clearInterval(t);
  }, [live, loadRoute]);

  const moved = driverPoint ? `${driverPoint.lat.toFixed(4)},${driverPoint.lng.toFixed(4)}` : '';
  useEffect(() => {
    if (live && moved && Date.now() - lastRoute.current > 8000) loadRoute();
  }, [moved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Without a live connection, still look for changes every 15 s
  useEffect(() => {
    if (!key || connected || (status && CLOSED.includes(status))) return undefined;
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [key, connected, status, refresh]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.post(`/bookings/${key.bookingNumber}/cancel`, { phone: key.phone });
      toast.info(t('This booking was cancelled.'));
      setConfirmCancel(false);
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  const reset = () => {
    forgetBooking();
    setKey(null);
    setBooking(null);
    setLookupError('');
    initial.current = { bookingNumber: null, phone: '' };
    navigate('/track', { replace: true });
  };

  if (loading) return <div className="loading" role="status"><div className="spinner" aria-hidden="true" />{t('Finding your booking')}</div>;

  if (!key || !booking) {
    return (
      <LookupForm
        initialNumber={initial.current.bookingNumber || ''}
        initialPhone={initial.current.phone || ''}
        error={lookupError}
        busy={loading}
        onSubmit={(bookingNumber, phone) => setKey({ bookingNumber, phone })}
      />
    );
  }

  const pickup = pickupPoint(booking);
  const driver = driverOf(booking);
  const closed = CLOSED.includes(status);
  const canCancel = !closed && status !== 'On The Way';
  const rating = myRating ?? (booking.rating && (booking.rating.stars ?? booking.rating.rating ?? booking.rating));
  const isSos = booking.severity === 'critical';

  return (
    <div className={`container page ${isSos ? 'sos-tracking' : ''}`}>
      <div className="page-head">
        <div>
          <h1 style={{ color: isSos ? '#d32f2f' : 'inherit' }}>
            {isSos && <span style={{ marginRight: 8 }}>🚨</span>}
            Booking #{booking.bookingNumber}
          </h1>
          {isSos && <p className="notice notice-error" style={{ margin: '8px 0', padding: '8px', borderLeft: '4px solid #d32f2f' }}><strong>{t('EMERGENCY SOS:')}</strong> High priority response activated.</p>}
          <p className="muted">{booking.serviceType} · {booking.vehicleType}{booking.createdAt ? ` · ${formatDateTime(booking.createdAt)}` : ''}</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className={statusClass(status)}>{status}</span>
          <button type="button" className="btn btn-sm btn-outline" onClick={reset}>{t('Track another')}</button>
          {live && notifPerm === 'default' && (
            <button type="button" className="btn btn-sm btn-outline" onClick={requestNotifications}>{t('Enable notifications')}</button>
          )}
        </div>
      </div>

      <div className="split">
        <div className="stack" style={{ gap: 18 }}>
          {(status === 'Pending' || status === 'Approved') && (
            <p className="notice" role="status">{t('We are finding the nearest driver. You can leave this page open; it updates by itself.')}</p>
          )}
          {status === 'Rejected' && <p className="notice notice-error" role="status">{t('Sorry, we could not take this request')}{booking.rejectionReason ? `: ${booking.rejectionReason}` : ''}{t('. Please try again or call a local service.')}</p>}
          {status === 'Cancelled' && <p className="notice notice-warn" role="status">{t('This booking was cancelled.')}</p>}

          {pickup && (
            <TrackingMap
              pickup={pickup}
              driver={live ? driverPoint : null}
              path={live ? route.path : null}
              className="tall"
              eta={live ? { minutes: route.etaMinutes, meters: route.distanceMeters, approximate: route.approximate, waiting: !driverPoint } : null}
              title={status === 'On The Way' ? t('Driver is on the way') : t('Driver assigned')}
              onRefresh={loadRoute}
            />
          )}
          {pickupText(booking) && <p className="small muted" style={{ margin: 0 }}>{t('Pickup:')} {pickupText(booking)}</p>}

          {driver && (
            <div className="card">
              <h2>{t('Your driver')}</h2>
              <p style={{ margin: '0 0 4px' }}><strong>{driver.name}</strong>{driver.vehicle ? ` · ${driver.vehicle}` : ''}</p>
              {driver.phone && <a className="btn btn-ok btn-sm" href={`tel:${driver.phone}`}>{t('Call')} {driver.phone}</a>}
            </div>
          )}

          {status === 'Completed' && (
            <div className="card">
              <h2>{t('How was the service?')}</h2>
              <RatingForm bookingNumber={key.bookingNumber} phone={key.phone} existing={rating} onDone={setMyRating} />
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line-light)' }}>
                <h2>{t('Receipt')}</h2>
                <p className="muted small" style={{ margin: '4px 0 12px' }}>{t('Download a PDF receipt for this booking.')}</p>
                <a 
                  href={`${(import.meta.env.VITE_API_URL || 'http://localhost:5055/api')}/bookings/${key.bookingNumber}/receipt?phone=${key.phone}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="btn btn-outline btn-sm"
                >
                  Download Receipt
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <div className="card">
            <h2>{t('Progress')}</h2>
            <StatusTimeline timeline={booking.timeline} status={status} />
          </div>

          {live ? (
            <div className="card">
              <h2>{t('Chat with your driver')}</h2>
              <ChatBox bookingNumber={key.bookingNumber} phone={key.phone} role="customer" />
            </div>
          ) : !closed ? (
            <p className="small muted">{t('Chat opens as soon as a driver is assigned.')}</p>
          ) : null}

          {live && (
            <div className="card">
              <h2>{t('Let someone follow along')}</h2>
              <ShareLinkButton bookingNumber={key.bookingNumber} phone={key.phone} />
            </div>
          )}

          {canCancel && (
            <div>
              {!confirmCancel ? (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmCancel(true)}>{t('Cancel this booking')}</button>
              ) : (
                <div className="notice notice-warn">
                  <p style={{ marginTop: 0 }}>{t('Cancel this request? Any driver on the way will be told.')}</p>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn btn-danger btn-sm" onClick={cancel} disabled={cancelling}>{cancelling ? t('Cancelling…') : t('Yes, cancel')}</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmCancel(false)}>{t('Keep it')}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
