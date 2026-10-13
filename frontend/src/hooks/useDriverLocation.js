import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import useSocket from './useSocket';

const ERRORS = {
  1: 'Location access is blocked. Allow location for this site in your browser settings.',
  2: 'Your phone could not work out where you are. Check that GPS is on.',
  3: 'Finding your location is taking too long. Move to an open area.',
};
const MIN_GAP_MS = 4000; // never send more often than this
const KEEP_ALIVE_MS = 15000; // send even when standing still, so the customer knows the driver is live

/** Distance in metres between two points (good enough for "have they moved?"). */
function metres(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Watches the phone's GPS and sends the position to the server while `enabled`.
 * Uses the live connection when there is one, and the plain web request otherwise.
 *   const { position, sharing, error, lastSentAt } = useDriverLocation({ enabled, bookingNumber });
 */
export default function useDriverLocation({ enabled, bookingNumber }) {
  const { socket, connected } = useSocket();
  const [position, setPosition] = useState(null); // { lat, lng, accuracy }
  const [error, setError] = useState('');
  const [lastSentAt, setLastSentAt] = useState(null);
  const watchId = useRef(null);
  const trailing = useRef(null);
  const lastSent = useRef({ at: 0, point: null });
  const live = useRef({ socket, connected, bookingNumber });
  live.current = { socket, connected, bookingNumber };

  const send = useCallback(async (point) => {
    const { socket: s, connected: c, bookingNumber: n } = live.current;
    const payload = { lat: point.lat, lng: point.lng, heading: point.heading ?? undefined, bookingNumber: n || undefined };
    lastSent.current = { at: Date.now(), point };
    if (s && c) s.emit('driver:location', payload);
    else {
      try { await api.post('/drivers/me/location', payload); } catch { return; }
    }
    setLastSentAt(Date.now());
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!navigator.geolocation) {
      setError('This phone or browser cannot share location.');
      return undefined;
    }
    setError('');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const point = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null };
        setPosition(point);
        setError('');
        const { at, point: prev } = lastSent.current;
        const gap = Date.now() - at;
        const worthSending = !prev || metres(prev, point) > 10 || gap > KEEP_ALIVE_MS;
        if (!worthSending) return;
        if (gap >= MIN_GAP_MS) {
          clearTimeout(trailing.current);
          send(point);
        } else {
          // Too soon after the last send: send the newest position as soon as the gap has passed, so a move is never lost
          clearTimeout(trailing.current);
          trailing.current = setTimeout(() => send(point), MIN_GAP_MS - gap);
        }
      },
      (err) => setError(ERRORS[err.code] || ERRORS[2]),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => {
      clearTimeout(trailing.current);
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled, send]);

  // Send one position straight away after a reconnect, so the map does not stay stale
  useEffect(() => {
    if (enabled && connected && lastSent.current.point) send(lastSent.current.point);
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  return { position, sharing: enabled && !error, error, lastSentAt };
}
