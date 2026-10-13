/**
 * "Arriving in 12 min . 4.2 km"
 *   etaMinutes, distanceMeters: from the route endpoint
 *   approximate: true when the routing service was unreachable and the server estimated in a straight line
 */
export function formatEta(minutes) {
  if (minutes == null) return '';
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(meters) {
  if (meters == null) return '';
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export default function EtaBadge({ etaMinutes, distanceMeters, approximate = false, waiting = false }) {
  if (etaMinutes == null) {
    return (
      <div className="eta" role="status">
        <span className="eta-sub">{waiting ? 'Waiting for the driver to share their location' : 'Arrival time will show once the driver is on the way'}</span>
      </div>
    );
  }
  return (
    <div className="eta" role="status" aria-live="polite">
      <span className="eta-sub">{approximate ? 'About' : 'Arriving in'}</span>
      <span className="eta-time">{formatEta(etaMinutes)}</span>
      <span className="eta-sub">
        {formatDistance(distanceMeters)}
        {distanceMeters != null ? ' away' : ''}
        {approximate ? ', straight-line estimate' : ''}
      </span>
    </div>
  );
}
