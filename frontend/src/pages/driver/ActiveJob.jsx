import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { useSocketEvent } from '../../hooks/useSocket';
import useDriverStatus from '../../hooks/useDriverStatus';
import useDriverLocation from '../../hooks/useDriverLocation';
import TrackingMap from '../../components/TrackingMap';
import EtaBadge from '../../components/EtaBadge';
import ChatBox from '../../components/ChatBox';
import StatusTimeline from '../../components/StatusTimeline';
import { statusClass } from '../../utils/format';
import { isLive, pickupPoint, pickupText, readRoute } from '../../utils/booking';

/** The job in progress: where to go, a route, chat, and the buttons that move the job forward. */
export default function ActiveJob() {
  const toast = useToast();
  const { active, loading, error, reload } = useDriverStatus();
  const [route, setRoute] = useState(readRoute(null));
  const [busy, setBusy] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const lastRoute = useRef(0);

  const job = active;
  const live = job && isLive(job.status);
  const { position, error: gpsError } = useDriverLocation({ enabled: Boolean(live), bookingNumber: job && job.bookingNumber });

  const loadRoute = useCallback(async () => {
    lastRoute.current = Date.now();
    try {
      const res = await api.get('/route/job');
      setRoute(readRoute(res.data.data));
    } catch { /* keep the last route */ }
  }, []);

  useEffect(() => {
    if (!live) return undefined;
    loadRoute();
    const t = setInterval(loadRoute, 20000);
    return () => clearInterval(t);
  }, [live, loadRoute]);

  // Refresh the route when the driver has moved, but not more than every 10 s
  const moved = position ? `${position.lat.toFixed(4)},${position.lng.toFixed(4)}` : '';
  useEffect(() => {
    if (live && moved && Date.now() - lastRoute.current > 10000) loadRoute();
  }, [moved]); // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent('job:cancelled', () => toast.alert('The customer cancelled this job.', { to: '/driver' }));

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await api.patch(`/bookings/${job.bookingNumber}/status`, { status });
      toast.success(status === 'On The Way' ? 'Trip started. The customer can see you.' : 'Job completed. Well done.');
      setConfirmDone(false);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div>;
  if (error && !job) return <div className="container page"><p className="notice notice-error" role="alert">{error}</p></div>;
  if (!job) {
    return (
      <div className="container page empty">
        <h1>No job right now</h1>
        <p style={{ margin: '0 auto 20px' }}>Stay online and share your location. The next request will pop up here.</p>
        <Link to="/driver" className="btn btn-primary">Back to dashboard</Link>
      </div>
    );
  }

  const pickup = pickupPoint(job);
  const customer = { name: job.name, phone: job.phone };
  const navUrl = pickup ? `https://www.google.com/maps/dir/?api=1&destination=${pickup.lat},${pickup.lng}&travelmode=driving` : null;
  const driverPoint = position ? { lat: position.lat, lng: position.lng } : route.driver;

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Job #{job.bookingNumber}</h1><p className="muted">{job.serviceType} · {job.vehicleType}{job.vehicleNumber ? ` · ${job.vehicleNumber}` : ''}</p></div>
        <span className={statusClass(job.status)}>{job.status}</span>
      </div>

      {live && gpsError && <p className="notice notice-error" role="alert">{gpsError} The customer cannot see you until this is fixed.</p>}

      <div className="split">
        <div className="stack" style={{ gap: 18 }}>
          {live && <EtaBadge etaMinutes={route.etaMinutes} distanceMeters={route.distanceMeters} approximate={route.approximate} waiting={!driverPoint} />}
          {pickup && <TrackingMap pickup={pickup} driver={live ? driverPoint : null} path={live ? route.path : null} className="tall" label="Map showing the route to the customer" />}

          <div className="card">
            <h2>Customer</h2>
            <p style={{ margin: '0 0 4px' }}><strong>{customer.name}</strong></p>
            <p className="muted" style={{ margin: '0 0 12px' }}>{pickupText(job)}</p>
            {job.description && <p style={{ margin: '0 0 12px' }}><strong>Notes:</strong> {job.description}</p>}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {customer.phone && <a className="btn btn-ok" href={`tel:${customer.phone}`}>Call customer</a>}
              {navUrl && <a className="btn btn-outline" href={navUrl} target="_blank" rel="noreferrer">Open in Maps</a>}
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <div className="card stack" style={{ gap: 12 }}>
            <h2 style={{ margin: 0 }}>Next step</h2>
            {job.status === 'Assigned' && (
              <>
                <p className="muted" style={{ margin: 0 }}>Start the trip when you leave. The customer then sees you on the map.</p>
                <button type="button" className="btn btn-signal btn-block" style={{ minHeight: 54 }} onClick={() => setStatus('On The Way')} disabled={busy}>{busy ? 'Please wait…' : 'Start trip'}</button>
              </>
            )}
            {job.status === 'On The Way' && (!confirmDone ? (
              <>
                <p className="muted" style={{ margin: 0 }}>Press this only when the work is finished.</p>
                <button type="button" className="btn btn-ok btn-block" style={{ minHeight: 54 }} onClick={() => setConfirmDone(true)}>Mark job complete</button>
              </>
            ) : (
              <div className="notice notice-warn">
                <p style={{ marginTop: 0 }}>Is the job finished? This cannot be undone.</p>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-ok btn-sm" onClick={() => setStatus('Completed')} disabled={busy}>{busy ? 'Saving…' : 'Yes, complete'}</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmDone(false)}>Not yet</button>
                </div>
              </div>
            ))}
            {!live && <p className="muted" style={{ margin: 0 }}>This job is {job.status.toLowerCase()}.</p>}
          </div>

          {live && (
            <div className="card">
              <h2>Chat with the customer</h2>
              <ChatBox bookingNumber={job.bookingNumber} role="driver" />
            </div>
          )}

          <div className="card">
            <h2>Progress</h2>
            <StatusTimeline timeline={job.timeline || job.statusHistory || []} status={job.status} />
          </div>
        </div>
      </div>
    </div>
  );
}
