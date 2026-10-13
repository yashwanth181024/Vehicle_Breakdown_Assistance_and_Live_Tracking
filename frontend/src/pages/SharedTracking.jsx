import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api/axios';
import useSocket, { emitWithAck, useSocketEvent } from '../hooks/useSocket';
import TrackingMap from '../components/TrackingMap';
import { statusClass } from '../utils/format';
import { driverOf, isLive, pickupPoint, pickupText, readRoute, toPoint } from '../utils/booking';

/**
 * What a family member sees from a share link: a map, an arrival time and the status.
 * No phone numbers, no chat, and no site menu.
 */
export default function SharedTracking() {
  const { token } = useParams();
  const { socket, connected } = useSocket();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(readRoute(null));
  const [driverPoint, setDriverPoint] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/share/${encodeURIComponent(token)}`);
      const d = res.data.data || {};
      const b = d.booking || d;
      setInfo(b);
      setError('');
      const dp = driverOf(b);
      if (dp && dp.point) setDriverPoint(dp.point);
    } catch (err) {
      setError(err.response && [404, 410].includes(err.response.status) ? 'This link has expired or is not valid.' : getErrorMessage(err));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket || !connected) return;
    emitWithAck(socket, 'booking:join-shared', { token });
  }, [socket, connected, token]);

  useSocketEvent('booking:status', load);
  useSocketEvent('booking:updated', load);
  const onMove = (d) => {
    const p = d && (toPoint(d.location) || toPoint(d));
    if (p) setDriverPoint(p);
  };
  useSocketEvent('driver:location', onMove);
  useSocketEvent('driver:moved', onMove);

  const live = info && isLive(info.status);
  const loadRoute = useCallback(async () => {
    try {
      const res = await api.get(`/route/share/${encodeURIComponent(token)}`);
      const r = readRoute(res.data.data);
      setRoute(r);
      if (r.driver) setDriverPoint(r.driver);
    } catch { /* keep the last route */ }
  }, [token]);

  useEffect(() => {
    if (!live) return undefined;
    loadRoute();
    const t = setInterval(loadRoute, 20000);
    return () => clearInterval(t);
  }, [live, loadRoute]);

  useEffect(() => {
    if (connected || !info || ['Completed', 'Cancelled', 'Rejected'].includes(info.status)) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [connected, info, load]);

  const header = (
    <header className="container row" style={{ padding: '14px 16px', justifyContent: 'space-between' }}>
      <strong>Vehicle Breakdown Assistant</strong>
      <span className="small muted">Live tracking</span>
    </header>
  );

  if (error) {
    return (
      <>
        {header}
        <div className="container page empty">
          <h1>Link not available</h1>
          <p style={{ margin: '0 auto 20px' }}>{error}</p>
          <Link to="/" className="btn btn-primary">Go to the home page</Link>
        </div>
      </>
    );
  }
  if (!info) return <>{header}<div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div></>;

  const pickup = pickupPoint(info);
  const driver = driverOf(info);
  const done = ['Completed', 'Cancelled', 'Rejected'].includes(info.status);

  return (
    <>
      {header}
      <div className="container page" style={{ paddingTop: 8, maxWidth: 820 }}>
        <div className="page-head">
          <div>
            <h1>{done ? 'Journey ended' : 'Help is on the way'}</h1>
            <p className="muted">{info.serviceType}{info.vehicleType ? ` · ${info.vehicleType}` : ''}</p>
          </div>
          <span className={statusClass(info.status)}>{info.status}</span>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          {info.status === 'Completed' && <p className="notice notice-ok" role="status">The job is complete. Everything went well.</p>}
          {['Cancelled', 'Rejected'].includes(info.status) && <p className="notice notice-warn" role="status">This request is no longer active.</p>}
          {!live && !done && <p className="notice" role="status">A driver has not been assigned yet. This page updates by itself.</p>}

          {pickup && (
            <TrackingMap
              pickup={pickup}
              driver={live ? driverPoint : null}
              path={live ? route.path : null}
              className="tall"
              label="Map showing the driver and the pickup point"
              eta={live ? { minutes: route.etaMinutes, meters: route.distanceMeters, approximate: route.approximate, waiting: !driverPoint } : null}
              title={info.status === 'On The Way' ? 'Driver is on the way' : 'Driver assigned'}
              onRefresh={loadRoute}
            />
          )}
          {pickupText(info) && <p className="small muted" style={{ margin: 0 }}>Pickup: {pickupText(info)}</p>}
          {driver && live && <p style={{ margin: 0 }}>Driver: <strong>{driver.name}</strong></p>}
        </div>
      </div>
    </>
  );
}
