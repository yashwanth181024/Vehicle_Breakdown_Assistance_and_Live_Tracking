import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import useDriverStatus from '../../hooks/useDriverStatus';
import { statusClass } from '../../utils/format';
import { pickupText } from '../../utils/booking';
import { num, pick } from '../../utils/adapt';

function PasswordForm({ onDone }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) return setError('The new password needs at least 6 characters.');
    setBusy(true);
    setError('');
    const body = { currentPassword: current, newPassword: next };
    try {
      await api.patch('/drivers/me/password', body);
      toast.success('Password changed.');
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 12 }} noValidate>
      <div className="field"><label htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div className="field"><label htmlFor="pw-new">New password</label><input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        <button className="btn btn-outline btn-sm" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export default function DriverDashboard() {
  const toast = useToast();
  const { profile, active, online, loading, error, busy, setOnline } = useDriverStatus();
  const [changing, setChanging] = useState(false);

  if (loading) return <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div>;

  const toggle = async () => {
    const r = await setOnline(!online);
    if (!r.ok) toast.error(r.message);
    else toast.info(!online ? 'You are online. Job requests can reach you.' : 'You are offline. No new requests.');
  };

  const stats = [
    ['Jobs done', pick(profile, ['completedJobs', 'jobsCompleted', 'completed', 'totalJobs'])],
    ['Rating', pick(profile, ['averageRating', 'avgRating', 'rating'])],
  ].filter(([, v]) => v !== undefined);

  return (
    <div className="container page" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div>
          <h1>Hello{profile && profile.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
          <p className="muted">
            {profile && profile.vehicleType ? `${profile.vehicleType}${profile.vehicleNumber ? ` · ${profile.vehicleNumber}` : ''}` : ' '}
            {profile && profile.serviceTypes && profile.serviceTypes.length > 0 ? <><br/>Services: {profile.serviceTypes.join(', ')}</> : null}
          </p>
        </div>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {profile?.verificationStatus === 'verified' && (
        <div className="card stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0 }}>{online ? 'You are online' : 'You are offline'}</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>{online ? 'New job requests near you will pop up here.' : 'Go online to receive job requests.'}</p>
            </div>
            <button type="button" className={`btn ${online ? 'btn-outline' : 'btn-ok'}`} onClick={toggle} disabled={busy} aria-pressed={online}>
              {online ? 'Go offline' : 'Go online'}
            </button>
          </div>
          {online && <p className="small" style={{ margin: 0 }}>Keep <Link to="/driver/location">location sharing</Link> on so the nearest driver gets the job.</p>}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Current job</h2>
        {active ? (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>#{active.bookingNumber} · {active.serviceType}</strong>
              <span className={statusClass(active.status)}>{active.status}</span>
            </div>
            <p className="muted" style={{ margin: '6px 0 12px' }}>{active.name} · {pickupText(active)}</p>
            <Link className="btn btn-primary" to="/driver/active">Open job</Link>
          </>
        ) : <p className="muted" style={{ margin: 0 }}>No job right now.</p>}
      </div>

      {stats.length > 0 && (
        <div className="stat-grid" style={{ marginTop: 16 }}>
          {stats.map(([label, v]) => <div className="stat" key={label}><div className="stat-value">{Number.isFinite(Number(v)) ? num(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : String(v)}</div><div className="stat-label">{label}</div></div>)}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Account Verification</h2>
        {profile?.verificationStatus === 'verified' ? (
          <p className="notice notice-success">Your account is verified. You can receive jobs.</p>
        ) : (
          <div>
            {profile?.verificationStatus === 'rejected' ? (
              <div className="notice notice-error" style={{ marginBottom: 12 }}>
                <strong>Verification Rejected</strong>
                <p style={{ margin: '4px 0 0' }}>Reason: {profile?.rejectionReason}</p>
              </div>
            ) : (
              <p className="notice notice-warning">Your account is pending verification. You cannot go online until an admin approves your documents.</p>
            )}
            
            {profile?.documents?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <strong>Uploaded Documents:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  {profile.documents.map((d, i) => (
                    <li key={i}>
                      <a href={`${import.meta.env.VITE_API_URL.replace('/api', '')}${d.url}`} target="_blank" rel="noreferrer">{d.name}</a> - {d.status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const name = fd.get('name');
              const file = fd.get('document');
              if (!name || !file || !file.size) return toast.error('Both name and file are required');
              try {
                // Submit as multipart/form-data
                await api.post('/drivers/me/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                toast.success('Document uploaded successfully');
                window.location.reload();
              } catch(err) {
                toast.error(getErrorMessage(err));
              }
            }} className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label>Document Name (e.g., License, Registration)</label>
                <input name="name" type="text" placeholder="Driver's License" required />
              </div>
              <div className="field">
                <label>Document File (PDF, JPG, PNG)</label>
                <input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>Upload Document</button>
            </form>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Account</h2>
        {profile && <p className="muted" style={{ margin: '0 0 12px' }}>{profile.username || profile.driverId}{profile.mobile ? ` · ${profile.mobile}` : ''}</p>}
        {changing ? <PasswordForm onDone={() => setChanging(false)} /> : <button type="button" className="btn btn-outline btn-sm" onClick={() => setChanging(true)}>Change password</button>}
      </div>
    </div>
  );
}
