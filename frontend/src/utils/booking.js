/**
 * Small adapters between what the server sends and what the pages need.
 * They accept the common spellings of each field, so a small difference in the API does not blank out a page.
 */

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** { lat, lng } from {lat,lng}, {latitude,longitude}, GeoJSON {coordinates:[lng,lat]} or [lat,lng] pairs. Otherwise null. */
export function toPoint(x) {
  if (!x) return null;
  let lat;
  let lng;
  if (Array.isArray(x.coordinates) && x.coordinates.length === 2) [lng, lat] = x.coordinates.map(num);
  else if (Array.isArray(x) && x.length === 2) [lat, lng] = x.map(num);
  else {
    lat = num(x.lat ?? x.latitude);
    lng = num(x.lng ?? x.lon ?? x.longitude);
  }
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function pickupPoint(b) {
  if (!b) return null;
  return (
    toPoint(b.pickup) ||
    toPoint(b.location) ||
    toPoint(b.pickupCoords) ||
    toPoint({ lat: b.pickupLat ?? b.latitude ?? b.lat, lng: b.pickupLng ?? b.longitude ?? b.lng })
  );
}

export function pickupText(b) {
  if (!b) return '';
  return b.pickupLocation || (b.pickup && b.pickup.address) || b.address || '';
}

/** The server sends the driver's vehicle as { type, number }; show it as plain text. */
function vehicleText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return [v.type, v.number].filter(Boolean).join(' ');
}

export function driverOf(b) {
  const d = b && (b.driver || b.assignedDriver);
  if (!d || typeof d !== 'object') return null;
  return {
    name: d.name || d.fullName || 'Your driver',
    phone: d.phone || d.mobile || '',
    vehicle: vehicleText(d.vehicleNumber || d.vehicle || d.truckNumber),
    point: toPoint(d.location) || toPoint(d.currentLocation) || toPoint(d),
  };
}

/** The route endpoints answer with eta/distance/path; read them whichever way they are named. */
export function readRoute(r) {
  if (!r) return { etaMinutes: null, distanceMeters: null, path: null, approximate: false, driver: null };
  const eta = r.etaMinutes ?? r.eta ?? (r.durationSeconds != null ? r.durationSeconds / 60 : null) ?? (r.duration != null ? r.duration / 60 : null);
  const dist = r.distanceMeters ?? r.distance ?? (r.distanceKm != null ? r.distanceKm * 1000 : null);
  let path = r.path || r.polyline || r.geometry || null;
  if (path && path.coordinates) path = path.coordinates.map(([lng, lat]) => [lat, lng]); // GeoJSON is lng,lat
  if (Array.isArray(path)) path = path.map((p) => (Array.isArray(p) ? p : [p.lat, p.lng]));
  return {
    etaMinutes: eta == null ? null : Number(eta),
    distanceMeters: dist == null ? null : Number(dist),
    path,
    approximate: Boolean(r.approximate ?? r.estimated ?? r.fallback ?? r.straightLine),
    driver: toPoint(r.driver) || toPoint(r.driverLocation) || toPoint(r.from),
  };
}

/** Booking numbers are shown as plain digits; people sometimes type "BK-1001" or "#1001". */
export const parseBookingNumber = (v) => {
  const n = Number(String(v || '').replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Chat and live tracking only make sense while a driver is on the job. */
export const isLive = (status) => status === 'Assigned' || status === 'On The Way';

export const getTrackingUrl = (bookingNumber, phone = '') => {
  const q = new URLSearchParams();
  if (bookingNumber) q.set('bookingNumber', bookingNumber);
  if (phone) q.set('phone', phone);
  return `/track?${q.toString()}`;
};
