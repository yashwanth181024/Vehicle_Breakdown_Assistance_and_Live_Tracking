import { useNavigate } from 'react-router-dom';
import useJobOffers from '../hooks/useJobOffers';
import { useToast } from '../context/ToastContext';

const RING = 289; // circumference of the r=46 circle below

/** Pops up over any driver page when the dispatcher offers a job. Accept it, reject it, or let the clock run out. */
export default function JobOfferModal() {
  const { offers, current, secondsLeft, totalSeconds, busy, accept, reject } = useJobOffers();
  const toast = useToast();
  const navigate = useNavigate();

  if (!current) return null;

  // The booking details may arrive nested or flat, so read both
  const b = { ...current, ...(current.booking || {}) };
  const pickup = b.pickupLocation || b.pickup?.address || b.address || 'Location shared on accept';
  const fraction = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const low = secondsLeft <= 10;
  const km = b.distanceKm ?? (b.distanceMeters != null ? b.distanceMeters / 1000 : null);

  const onAccept = async () => {
    const r = await accept();
    if (r.ok) {
      toast.success('Job accepted. Head to the customer.');
      navigate('/driver/active');
    } else toast.error(r.message || 'Could not accept this job. It may have been taken.');
  };
  const onReject = async () => {
    const r = await reject();
    if (!r.ok) toast.error(r.message || 'Could not reject this job.');
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal offer" role="alertdialog" aria-modal="true" aria-labelledby="offer-title" aria-describedby="offer-facts">
        <div className={`offer-count${low ? ' low' : ''}`} role="timer" aria-label={`${secondsLeft} seconds left`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="track" cx="50" cy="50" r="46" />
            <circle className="bar" cx="50" cy="50" r="46" strokeDasharray={RING} strokeDashoffset={RING * (1 - fraction)} />
          </svg>
          <span>{secondsLeft}</span>
        </div>

        <h2 id="offer-title">New job request</h2>
        <dl className="offer-facts" id="offer-facts">
          <div><dt>Service</dt><dd>{b.serviceType || '—'}</dd></div>
          <div><dt>Vehicle</dt><dd>{b.vehicleType || '—'}</dd></div>
          <div><dt>Pickup</dt><dd>{pickup}</dd></div>
          {km != null && <div><dt>Distance</dt><dd>{Number(km).toFixed(1)} km from you</dd></div>}
          {b.severity && <div><dt>Urgency</dt><dd><span className={`badge sev-${String(b.severity).toLowerCase()}`}>{b.severity}</span></dd></div>}
        </dl>

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onReject} disabled={busy}>Reject</button>
          <button type="button" className="btn btn-ok" onClick={onAccept} disabled={busy}>{busy ? 'Please wait…' : 'Accept job'}</button>
        </div>
        {offers.length > 1 && <p className="small muted" style={{ textAlign: 'center', margin: '10px 0 0' }}>{offers.length - 1} more waiting</p>}
      </div>
    </div>
  );
}
