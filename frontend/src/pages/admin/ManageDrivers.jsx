import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { VEHICLE_TYPES, cleanPhone, isPhone } from '../../utils/format';
import { idOf, listOf } from '../../utils/adapt';

const EMPTY = { name: '', username: '', phone: '', password: '', vehicleType: 'Truck', vehicleNumber: '' };

function DriverForm({ driver, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(driver);
  const [form, setForm] = useState(editing ? { ...EMPTY, ...driver, password: '' } : EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (form.name.trim().length < 2) found.name = 'Enter the driver name.';
    if (!editing && form.username.trim().length < 3) found.username = 'At least 3 characters.';
    if (!isPhone(form.phone) || cleanPhone(form.phone).length !== 10) found.phone = 'Enter a 10-digit mobile number.';
    if (!editing && form.password.length < 6) found.password = 'At least 6 characters.';
    if (editing && form.password && form.password.length < 6) found.password = 'At least 6 characters, or leave blank to keep the current one.';
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = {
      name: form.name.trim(),
      phone: cleanPhone(form.phone),
      vehicleType: form.vehicleType,
      vehicleNumber: form.vehicleNumber.trim().toUpperCase() || undefined,
    };
    if (!editing) body.username = form.username.trim();
    if (form.password) body.password = form.password;
    setBusy(true);
    setError('');
    try {
      if (editing) await api.put(`/drivers/${idOf(driver)}`, body);
      else await api.post('/drivers', body);
      toast.success(editing ? 'Driver updated.' : 'Driver added.');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const fe = (k) => errors[k] && <span className="field-error" role="alert">{errors[k]}</span>;

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit driver' : 'Add driver'} onSubmit={submit} noValidate>
        <h2>{editing ? 'Edit driver' : 'Add a driver'}</h2>
        <div className="stack" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="d-name">Name</label><input id="d-name" value={form.name} onChange={set('name')} aria-invalid={Boolean(errors.name)} autoFocus />{fe('name')}</div>
          {!editing && <div className="field"><label htmlFor="d-user">Username</label><input id="d-user" value={form.username} onChange={set('username')} autoComplete="off" aria-invalid={Boolean(errors.username)} />{fe('username')}</div>}
          <div className="field"><label htmlFor="d-phone">Mobile number</label><input id="d-phone" type="tel" inputMode="numeric" value={form.phone} onChange={set('phone')} aria-invalid={Boolean(errors.phone)} />{fe('phone')}</div>
          <div className="field">
            <label htmlFor="d-pass">{editing ? 'New password (optional)' : 'Password'}</label>
            <input id="d-pass" type="text" value={form.password} onChange={set('password')} autoComplete="new-password" aria-invalid={Boolean(errors.password)} />
            {fe('password')}
          </div>
          <div className="field"><label htmlFor="d-vt">Vehicle</label>
            <select id="d-vt" value={form.vehicleType} onChange={set('vehicleType')}>{VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="d-vn">Vehicle number</label><input id="d-vn" value={form.vehicleNumber} onChange={set('vehicleNumber')} placeholder="KA 01 AB 1234" /></div>
        </div>
        {error && <p className="notice notice-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

export default function ManageDrivers() {
  const toast = useToast();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // null closed, {} new, driver to edit
  const [removing, setRemoving] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/drivers');
      setDrivers(listOf(res.data.data, 'drivers'));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/drivers/${idOf(removing)}`);
      toast.info(`${removing.name} was removed.`);
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const updateVerification = async (driver, status, reason = '') => {
    try {
      await api.patch(`/drivers/${idOf(driver)}/verify`, { status, rejectionReason: reason });
      toast.success(`Driver ${status}.`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Drivers</h1><p className="muted">{drivers.length} registered</p></div>
        <button type="button" className="btn btn-primary" onClick={() => setForm({})}>Add driver</button>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div> : drivers.length === 0 ? <p className="empty">No drivers yet. Add the first one.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Phone</th><th>Vehicle</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={idOf(d)}>
                  <td>{d.name}</td>
                  <td>{d.username}</td>
                  <td>{d.phone}</td>
                  <td>{d.vehicleType}{d.vehicleNumber ? ` · ${d.vehicleNumber}` : ''}</td>
                  <td>
                    {d.verificationStatus === 'verified' ? <span className="badge badge-completed">Verified</span> : d.verificationStatus === 'rejected' ? <span className="badge badge-error">Rejected</span> : <span className="badge badge-pending">Pending</span>}
                    <span className={`badge ${d.isOnline || d.online ? 'badge-completed' : 'badge-pending'}`} style={{ marginLeft: 6 }}>{d.isOnline || d.online ? 'Online' : 'Offline'}</span>
                    {(d.isBusy || d.busy || d.activeBooking) ? <span className="badge badge-ontheway" style={{ marginLeft: 6 }}>On a job</span> : null}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button type="button" className="btn btn-sm btn-ok" onClick={() => setReviewing(d)}>Review Docs</button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setForm(d)}>Edit</button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => setRemoving(d)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && <DriverForm driver={idOf(form) ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {removing && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="alertdialog" aria-modal="true" aria-label="Remove driver">
            <h2>Remove {removing.name}?</h2>
            <p>They will no longer be able to log in. Their past jobs stay in the records.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setRemoving(null)}>Keep</button>
              <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button>
            </div>
          </div>
        </div>
      )}
      {reviewing && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Review Documents for {reviewing.name}</h2>
            {reviewing.documents && reviewing.documents.length > 0 ? (
              <ul style={{ marginBottom: 20 }}>
                {reviewing.documents.map((d, i) => (
                  <li key={i}>
                    <a href={`${import.meta.env.VITE_API_URL.replace('/api', '')}${d.url}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{d.name}</a> - {d.status}
                  </li>
                ))}
              </ul>
            ) : <p>No documents uploaded.</p>}
            <div className="modal-actions" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
              <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
                <button className="btn btn-outline" onClick={() => setReviewing(null)}>Close</button>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-danger" onClick={() => {
                    const reason = window.prompt("Rejection reason:");
                    if (reason !== null) {
                      updateVerification(reviewing, 'rejected', reason);
                      setReviewing(null);
                    }
                  }}>
                    Reject
                  </button>
                  <button className="btn btn-ok" onClick={() => {
                    updateVerification(reviewing, 'verified');
                    setReviewing(null);
                  }}>
                    Verify
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
