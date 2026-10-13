import { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import useDriverStatus from '../../hooks/useDriverStatus';
import useDriverLocation from '../../hooks/useDriverLocation';
import TrackingMap from '../../components/TrackingMap';

/** Turn location sharing on and off. Sharing is what lets the dispatcher find the nearest driver. */
export default function ShareLocation() {
  const toast = useToast();
  const { online, active, loading, busy, setOnline } = useDriverStatus();
  const [sharing, setSharing] = useState(false);
  const { position, error, lastSentAt } = useDriverLocation({ enabled: sharing, bookingNumber: active && active.bookingNumber });
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div>;

  const start = async () => {
    setSharing(true);
    if (!online) {
      const r = await setOnline(true);
      if (!r.ok) toast.error(r.message);
    }
  };
  const ago = lastSentAt ? Math.max(0, Math.round((Date.now() - lastSentAt) / 1000)) : null;

  return (
    <div className="container page" style={{ maxWidth: 820 }}>
      <div className="page-head"><div><h1>Share location</h1><p className="muted">Keep this on while you are working. Leave this page open or the phone awake.</p></div></div>

      <div className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div>
            <strong>{sharing && !error ? 'Sharing your location' : 'Not sharing'}</strong>
            <div className="small muted">
              {sharing && !error && ago != null ? `Last sent ${ago < 5 ? 'just now' : `${ago} s ago`}` : sharing && !error ? 'Waiting for GPS…' : 'Customers cannot see you and you will not get nearby jobs.'}
            </div>
          </div>
          {sharing
            ? <button type="button" className="btn btn-outline" onClick={() => setSharing(false)}>Stop sharing</button>
            : <button type="button" className="btn btn-signal" onClick={start} disabled={busy}>Start sharing</button>}
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {position && position.accuracy > 100 && <p className="notice notice-warn">GPS is not very accurate right now (about {Math.round(position.accuracy)} m). Move outdoors if you can.</p>}
      </div>

      {position && (
        <div style={{ marginTop: 16 }}>
          <TrackingMap pickup={{ lat: position.lat, lng: position.lng }} driver={{ lat: position.lat, lng: position.lng }} hidePickup className="tall" label="Map showing your position" />
        </div>
      )}
      {!online && !sharing && <p className="small muted" style={{ marginTop: 12 }}>Starting to share also puts you online.</p>}
    </div>
  );
}
