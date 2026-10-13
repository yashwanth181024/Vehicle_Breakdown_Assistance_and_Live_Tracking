import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import TrackingMap from '../../components/TrackingMap';
import { statusClass } from '../../utils/format';
import { pickupPoint, pickupText, toPoint } from '../../utils/booking';
import { idOf, listOf, num } from '../../utils/adapt';

/** Nearby online drivers for one request, nearest first, and a button to give the job to one of them. */
export default function AssignDriver() {
  const { bookingNumber } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [booking, setBooking] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/bookings/${bookingNumber}/candidates`);
      const d = res.data.data || {};
      setBooking(d.booking || null);
      setDrivers(listOf(d, 'candidates', 'drivers'));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [bookingNumber]);

  useEffect(() => { load(); }, [load]);

  const assign = async (driver) => {
    const d = driver.driver && typeof driver.driver === 'object' ? driver.driver : driver;
    setBusy(idOf(d));
    try {
      await api.post(`/admin/bookings/${bookingNumber}/assign`, { driverId: idOf(d) });
      toast.success(`${d.name || 'Driver'} was assigned to booking ${bookingNumber}.`);
      navigate('/admin/requests');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setBusy('');
    }
  };

  const pickup = pickupPoint(booking);

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Assign a driver</h1><p className="muted">Booking #{bookingNumber}</p></div>
        <Link className="btn btn-outline" to="/admin/requests">Back to requests</Link>
      </div>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Finding drivers</div> : (
        <div className="split">
          <div className="stack" style={{ gap: 18 }}>
            {booking && (
              <div className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 style={{ margin: 0 }}>{booking.serviceType}</h2>
                  <span className={statusClass(booking.status)}>{booking.status}</span>
                </div>
                <p style={{ margin: '8px 0 0' }}>{booking.name} · {booking.phone}</p>
                <p className="muted" style={{ margin: 0 }}>{booking.vehicleType} · {pickupText(booking)}</p>
              </div>
            )}
            {pickup && (
              <TrackingMap
                pickup={pickup}
                driver={null}
                className="tall"
                label="Map of the pickup point"
              />
            )}
          </div>

          <div className="card">
            <h2>Drivers near the pickup</h2>
            {drivers.length === 0 ? (
              <p className="muted">No online driver is free right now. Drivers must be online and share their location. Try again in a moment.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {drivers.map((c) => {
                  const d = c.driver && typeof c.driver === 'object' ? c.driver : c;
                  const dist = c.distanceKm ?? (c.distanceMeters != null ? c.distanceMeters / 1000 : c.distance);
                  const eta = c.etaMinutes ?? c.eta;
                  const where = toPoint(d.location) || toPoint(c.location);
                  return (
                    <li key={idOf(d) || d.name} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                        <div>
                          <strong>{d.name}</strong>
                          <div className="small muted">
                            {d.vehicleType || ''}{d.vehicleNumber ? ` · ${d.vehicleNumber}` : ''}
                            {dist != null && Number.isFinite(num(dist, NaN)) ? ` · ${num(dist).toFixed(1)} km away` : ''}
                            {eta != null && Number.isFinite(num(eta, NaN)) ? ` · about ${Math.round(num(eta))} min` : ''}
                            {!where ? ' · location unknown' : ''}
                          </div>
                        </div>
                        <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(busy)} onClick={() => assign(c)}>
                          {busy === idOf(d) ? 'Assigning…' : 'Assign'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 12 }} onClick={load}>Refresh</button>
          </div>
        </div>
      )}
    </div>
  );
}
