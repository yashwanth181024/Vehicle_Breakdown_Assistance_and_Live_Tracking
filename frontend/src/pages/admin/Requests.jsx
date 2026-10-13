import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { useSocketEvent } from '../../hooks/useSocket';
import ChatBox from '../../components/ChatBox';
import StatusTimeline from '../../components/StatusTimeline';
import { STATUSES, formatDateTime, statusClass } from '../../utils/format';
import { isLive, pickupText } from '../../utils/booking';
import { listOf, pageOf } from '../../utils/adapt';

const LIMIT = 15;

function Details({ booking, onClose }) {
  const b = booking;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Booking ${b.bookingNumber}`} style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ margin: 0 }}>Booking #{b.bookingNumber}</h2>
          <span className={statusClass(b.status)}>{b.status}</span>
        </div>
        <dl className="offer-facts" style={{ marginTop: 14 }}>
          <div><dt>Customer</dt><dd>{b.name}</dd></div>
          <div><dt>Phone</dt><dd><a href={`tel:${b.phone}`}>{b.phone}</a></dd></div>
          <div><dt>Service</dt><dd>{b.serviceType}</dd></div>
          <div><dt>Vehicle</dt><dd>{b.vehicleType}{b.vehicleNumber ? ` · ${b.vehicleNumber}` : ''}</dd></div>
          <div><dt>Pickup</dt><dd>{pickupText(b)}</dd></div>
          {b.driver && <div><dt>Driver</dt><dd>{b.driver.name || ''}</dd></div>}
          <div><dt>Requested</dt><dd>{formatDateTime(b.createdAt)}</dd></div>
        </dl>
        {b.description && <p><strong>Notes:</strong> {b.description}</p>}
        <h3>Progress</h3>
        <StatusTimeline timeline={b.timeline || b.statusHistory || []} status={b.status} />
        {isLive(b.status) && (
          <>
            <h3>Customer and driver chat (read only)</h3>
            <ChatBox bookingNumber={b.bookingNumber} role="admin" />
          </>
        )}
        <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export default function AdminRequests() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  const [rows, setRows] = useState([]);
  const [info, setInfo] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(null);

  const setParam = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const res = await api.get('/bookings', { params: { status: status || undefined, q: q || undefined, search: q || undefined, page, limit: LIMIT } });
      const d = res.data.data;
      const list = listOf(d, 'bookings');
      setRows(list);
      setInfo(pageOf(d, list.length, LIMIT));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, q, page]);

  useEffect(() => { load(false); }, [load]);
  useSocketEvent('admin:alert', () => load(true));
  useSocketEvent('booking:status', () => load(true));
  useSocketEvent('booking:updated', () => load(true));

  const setStatus = async (b, next, remark) => {
    setBusy(`${b.bookingNumber}`);
    try {
      await api.patch(`/bookings/${b.bookingNumber}/status`, { status: next, remark: remark || undefined });
      toast.success(`Booking ${b.bookingNumber}: ${next.toLowerCase()}.`);
      setRejecting(null);
      setReason('');
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="container page">
      <div className="page-head"><div><h1>Requests</h1><p className="muted">{info.total ? `${info.total} in total` : ' '}</p></div></div>

      <form className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); setParam({ q: search.trim() }); }}>
        <input type="search" aria-label="Search by booking number, name or phone" placeholder="Search number, name or phone" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 220px' }} />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <div className="chips" role="group" aria-label="Filter by status" style={{ marginBottom: 14 }}>
        <button type="button" className="chip" aria-pressed={!status} onClick={() => setParam({ status: '' })}>All</button>
        {STATUSES.map((s) => <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setParam({ status: s })}>{s}</button>)}
      </div>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div> : rows.length === 0 ? (
        <p className="empty">No requests match.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Customer</th><th>Problem</th><th>Pickup</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((b) => {
                const waiting = b.status === 'Pending' || b.status === 'Approved';
                return (
                  <tr key={b.bookingNumber}>
                    <td>{b.bookingNumber}</td>
                    <td>{b.name}<br /><span className="small muted">{b.phone}</span></td>
                    <td>{b.serviceType}<br /><span className="small muted">{b.vehicleType}</span></td>
                    <td style={{ maxWidth: 220 }}>{pickupText(b)}</td>
                    <td><span className={statusClass(b.status)}>{b.status}</span></td>
                    <td>{formatDateTime(b.createdAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {waiting && <Link className="btn btn-sm btn-primary" to={`/admin/requests/${b.bookingNumber}/assign`}>Assign</Link>}
                        {b.status === 'Pending' && <button type="button" className="btn btn-sm btn-ok" disabled={busy === `${b.bookingNumber}`} onClick={() => setStatus(b, 'Approved')}>Approve</button>}
                        {waiting && <button type="button" className="btn btn-sm btn-danger" onClick={() => { setRejecting(b); setReason(''); }}>Reject</button>}
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => setOpen(b)}>Details</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {info.pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Previous</button>
          <span>Page {page} of {info.pages}</span>
          <button type="button" className="btn btn-sm btn-outline" disabled={page >= info.pages} onClick={() => setParam({ page: String(page + 1) })}>Next</button>
        </nav>
      )}

      {rejecting && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-label="Reject request" onSubmit={(e) => { e.preventDefault(); setStatus(rejecting, 'Rejected', reason.trim()); }}>
            <h2>Reject booking #{rejecting.bookingNumber}?</h2>
            <div className="field">
              <label htmlFor="rej">Reason (shown to the customer)</label>
              <textarea id="rej" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setRejecting(null)}>Keep it</button>
              <button type="submit" className="btn btn-danger" disabled={Boolean(busy)}>Reject</button>
            </div>
          </form>
        </div>
      )}

      {open && <Details booking={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
