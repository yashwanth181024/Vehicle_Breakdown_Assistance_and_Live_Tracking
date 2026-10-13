import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, statusClass } from '../../utils/format';
import { pickupText } from '../../utils/booking';
import { listOf, num, pick } from '../../utils/adapt';

const iso = (d) => d.toISOString().slice(0, 10);

export default function Reports() {
  const toast = useToast();
  const today = new Date();
  const monthAgo = new Date(Date.now() - 29 * 86400000);
  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(today));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (from > to) { setError('The start date must be before the end date.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/analytics/report', { params: { from, to } });
      setData(res.data.data || {});
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = listOf(data, 'bookings', 'report', 'records');
  const totals = [
    ['Requests', pick(data, ['total', 'totalBookings', 'count'], ['totals', 'summary']) ?? rows.length],
    ['Completed', pick(data, ['completed', 'Completed'], ['totals', 'summary', 'counts', 'statusCounts'])],
    ['Cancelled', pick(data, ['cancelled', 'Cancelled'], ['totals', 'summary', 'counts', 'statusCounts'])],
    ['Average rating', pick(data, ['averageRating', 'avgRating'], ['totals', 'summary'])],
  ].filter(([, v]) => v !== undefined && v !== null);

  /** The CSV needs the login token, so it is fetched with the API client and saved from memory. */
  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/analytics/report.csv', { params: { from, to }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookings-${from}-to-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not download the file.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="container page">
      <div className="page-head"><div><h1>Reports</h1><p className="muted">Requests between two dates.</p></div></div>

      <form className="card row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div className="field"><label htmlFor="r-from">From</label><input id="r-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label htmlFor="r-to">To</label><input id="r-to" type="date" value={to} min={from} max={iso(today)} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn btn-primary" type="submit" disabled={loading}>Show report</button>
        <button className="btn btn-outline" type="button" onClick={download} disabled={downloading}>{downloading ? 'Preparing…' : 'Download CSV'}</button>
      </form>

      {error && <p className="notice notice-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
      {loading ? <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div> : data && (
        <>
          {totals.length > 0 && (
            <div className="stat-grid" style={{ marginTop: 16 }}>
              {totals.map(([label, v]) => (
                <div className="stat" key={label}><div className="stat-value">{Number.isFinite(Number(v)) ? num(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : String(v)}</div><div className="stat-label">{label}</div></div>
              ))}
            </div>
          )}
          {rows.length === 0 ? <p className="empty">No requests in this period.</p> : (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>#</th><th>Date</th><th>Customer</th><th>Service</th><th>Pickup</th><th>Driver</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.bookingNumber}>
                      <td>{b.bookingNumber}</td>
                      <td>{formatDateTime(b.createdAt)}</td>
                      <td>{b.name}</td>
                      <td>{b.serviceType}</td>
                      <td style={{ maxWidth: 220 }}>{pickupText(b)}</td>
                      <td>{(b.driver && b.driver.name) || b.driverName || '—'}</td>
                      <td><span className={statusClass(b.status)}>{b.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
