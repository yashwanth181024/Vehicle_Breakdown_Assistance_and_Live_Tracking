import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/axios';
import { useSocketEvent } from '../../hooks/useSocket';
import { CLOSED, formatDateTime, statusClass } from '../../utils/format';
import { pickupText } from '../../utils/booking';
import { listOf } from '../../utils/adapt';

const FILTERS = [['', 'All'], ['open', 'In progress'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled']];

export default function MyJobs() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/drivers/me/jobs');
      setJobs(listOf(res.data.data, 'jobs', 'bookings').filter(Boolean));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('job:assigned', load);
  useSocketEvent('booking:status', load);

  const shown = jobs.filter((j) => (!filter ? true : filter === 'open' ? !CLOSED.includes(j.status) : j.status === filter));

  return (
    <div className="container page">
      <div className="page-head"><div><h1>My jobs</h1><p className="muted">{jobs.length} in total</p></div></div>
      <div className="chips" role="group" aria-label="Filter jobs" style={{ marginBottom: 14 }}>
        {FILTERS.map(([v, label]) => <button key={label} type="button" className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>)}
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div> : shown.length === 0 ? <p className="empty">No jobs here yet.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {shown.map((j) => {
            const rating = j.rating && (j.rating.stars ?? j.rating.rating ?? (typeof j.rating === 'number' ? j.rating : null));
            return (
              <li key={j.bookingNumber} className="card">
                <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                  <strong>#{j.bookingNumber} · {j.serviceType}</strong>
                  <span className={statusClass(j.status)}>{j.status}</span>
                </div>
                <p style={{ margin: '6px 0 0' }}>{j.name} · {j.vehicleType}</p>
                <p className="muted small" style={{ margin: '2px 0 0' }}>{pickupText(j)}</p>
                <p className="muted small" style={{ margin: '2px 0 0' }}>{formatDateTime(j.createdAt)}{rating ? ` · rated ${rating}★` : ''}</p>
                {!CLOSED.includes(j.status) && <Link className="btn btn-sm btn-primary" style={{ marginTop: 10 }} to="/driver/active">Open</Link>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
