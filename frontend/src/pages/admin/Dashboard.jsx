import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/axios';
import { useSocketEvent } from '../../hooks/useSocket';
import { formatDateTime, statusClass } from '../../utils/format';
import { listOf, pick } from '../../utils/adapt';

const CARDS = [
  { label: 'Total requests', keys: ['totalBookings', 'total', 'bookings'] },
  { label: 'Waiting for a driver', keys: ['pending', 'Pending'], attention: true, to: '/admin/requests?status=Pending' },
  { label: 'Driver assigned', keys: ['assigned', 'Assigned'] },
  { label: 'On the way', keys: ['onTheWay', 'ontheway', 'On The Way'] },
  { label: 'Completed', keys: ['completed', 'Completed'] },
  { label: 'Cancelled or rejected', keys: ['cancelled', 'Cancelled', 'rejected', 'Rejected'] },
  { label: 'Drivers online', keys: ['onlineDrivers', 'driversOnline', 'activeDrivers', 'online'] },
  { label: 'Average rating', keys: ['averageRating', 'avgRating', 'rating'], decimals: 1 },
];

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api.get('/analytics/summary'),
        api.get('/bookings', { params: { limit: 6, page: 1 } }),
      ]);
      setSummary(s.data.data || {});
      setRecent(listOf(r.data.data, 'bookings'));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('admin:alert', load);
  useSocketEvent('booking:status', load);

  if (loading) return <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div>;

  const cards = CARDS.map((c) => ({ ...c, value: pick(summary, c.keys) })).filter((c) => c.value !== undefined);

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Dashboard</h1><p className="muted">What is happening right now.</p></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to="/admin/requests">All requests</Link>
          <Link className="btn btn-outline" to="/admin/drivers">Drivers</Link>
          <Link className="btn btn-outline" to="/admin/analytics">Analytics</Link>
          <Link className="btn btn-outline" to="/admin/heatmap">Heatmap</Link>
        </div>
      </div>

      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {cards.length > 0 && (
        <div className="stat-grid">
          {cards.map((c) => {
            const v = Number(c.value);
            const shown = c.decimals != null ? v.toFixed(c.decimals) : v.toLocaleString('en-IN');
            const body = (
              <>
                <div className="stat-value">{Number.isFinite(v) ? shown : String(c.value)}</div>
                <div className="stat-label">{c.label}</div>
              </>
            );
            const cls = `stat${c.attention && v > 0 ? ' attention' : ''}`;
            return c.to ? <Link key={c.label} to={c.to} className={cls}>{body}</Link> : <div key={c.label} className={cls}>{body}</div>;
          })}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Latest requests</h2>
          <Link to="/admin/requests">See all</Link>
        </div>
        {recent.length === 0 ? <p className="muted">No requests yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Customer</th><th>Service</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.bookingNumber}>
                    <td>{b.bookingNumber}</td>
                    <td>{b.name || b.customerName}</td>
                    <td>{b.serviceType}</td>
                    <td><span className={statusClass(b.status)}>{b.status}</span></td>
                    <td>{formatDateTime(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
