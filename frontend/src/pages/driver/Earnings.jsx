import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';

export default function DriverEarnings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/drivers/me/earnings')
      .then(res => {
        if (alive) {
          setData(res.data.data);
          setError('');
        }
      })
      .catch(err => alive && setError(getErrorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <div className="container page">
      <div className="page-head">
        <h1>My Earnings</h1>
        <p className="muted">Your performance and total earnings.</p>
      </div>

      {loading && <div className="loading"><div className="spinner" />Loading</div>}
      {error && <p className="notice notice-error">{error}</p>}
      
      {data && (
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">₹{data.totalEarned?.toLocaleString('en-IN') || 0}</div>
            <div className="stat-label">Total Earned</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.completedJobs || 0}</div>
            <div className="stat-label">Completed Jobs</div>
          </div>
          <div className="stat">
            <div className="stat-value">{data.avgRating ? `${data.avgRating} ★` : '—'}</div>
            <div className="stat-label">Average Rating</div>
          </div>
        </div>
      )}
    </div>
  );
}
