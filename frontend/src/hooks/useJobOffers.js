import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { getErrorMessage } from '../api/axios';
import useSocket, { emitWithAck, playAlert, useSocketEvent } from './useSocket';

/**
 * Driver side of dispatch: receives job offers, counts down, accepts or rejects.
 *
 * The countdown is measured on this device from the moment the offer arrived (the server sends
 * "timeoutSeconds"), so a phone with a wrong clock still shows the right time left.
 *
 *   const { current, secondsLeft, accept, reject, busy } = useJobOffers();
 *   accept() resolves to { ok:true, bookingNumber } or { ok:false, message }
 */
export default function useJobOffers({ enabled = true } = {}) {
  const { socket } = useSocket();
  const [offers, setOffers] = useState([]); // each has a local `deadline` (ms)
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const add = useCallback((offer) => {
    const deadline = Date.now() + Math.max(1, offer.timeoutSeconds || 60) * 1000;
    setOffers((list) => [...list.filter((o) => o.offerId !== offer.offerId), { ...offer, deadline }]);
  }, []);
  const remove = useCallback((offerId) => setOffers((list) => list.filter((o) => o.offerId !== offerId)), []);

  useSocketEvent('offer:new', (offer) => {
    if (!enabled) return;
    const isNew = !offers.some((o) => o.offerId === offer.offerId); // a reconnect re-sends open offers
    add(offer);
    if (isNew) {
      playAlert();
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    }
  });
  useSocketEvent('offer:expired', (d) => remove(d.offerId));
  useSocketEvent('offer:cancelled', (d) => remove(d.offerId));

  // Offers that arrived while the socket was still connecting
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    api
      .get('/drivers/me/offers')
      .then((res) => {
        if (!cancelled) (res.data.data || []).forEach(add);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, add]);

  // Tick twice a second while an offer is open
  const hasOffers = offers.length > 0;
  useEffect(() => {
    if (!hasOffers) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [hasOffers]);

  // Drop offers whose time has run out (the server expires them too)
  useEffect(() => {
    if (offers.some((o) => o.deadline <= now)) setOffers((list) => list.filter((o) => o.deadline > Date.now()));
  }, [now, offers]);

  const current = useMemo(() => [...offers].sort((a, b) => a.deadline - b.deadline)[0] || null, [offers]);
  const secondsLeft = current ? Math.max(0, Math.ceil((current.deadline - now) / 1000)) : 0;

  const respond = useCallback(
    async (action, offer) => {
      const target = offer || current;
      if (!target || busy) return { ok: false, message: 'No job offer to answer.' };
      setBusy(true);
      try {
        let result = await emitWithAck(socket, `offer:${action}`, { offerId: target.offerId });
        // Not connected live: fall back to the plain web request, which does the same thing
        if (!result.ok && /Not connected|did not answer/.test(result.message || '')) {
          try {
            const res = await api.post(`/drivers/me/offers/${target.offerId}/${action}`);
            result = { ok: true, ...(res.data.data || {}) };
          } catch (err) {
            result = { ok: false, message: getErrorMessage(err) };
          }
        }
        remove(target.offerId);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [busy, current, remove, socket]
  );

  return {
    offers,
    current,
    secondsLeft,
    totalSeconds: current ? Math.max(1, current.timeoutSeconds || 60) : 60,
    busy,
    accept: (offer) => respond('accept', offer),
    reject: (offer) => respond('reject', offer),
  };
}
