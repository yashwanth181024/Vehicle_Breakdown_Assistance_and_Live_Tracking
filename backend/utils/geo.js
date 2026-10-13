/**
 * Geo helpers. MongoDB GeoJSON order is always [longitude, latitude].
 */

const EARTH_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;

function isValidCoords(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  return (
    Number.isFinite(la) && Number.isFinite(lo) &&
    la >= -90 && la <= 90 && lo >= -180 && lo <= 180
  );
}

/** Builds a GeoJSON Point from latitude/longitude. Returns undefined if invalid. */
function toPoint(lat, lng) {
  if (!isValidCoords(lat, lng)) return undefined;
  return { type: 'Point', coordinates: [Number(lng), Number(lat)] };
}

/** Reads { lat, lng } back out of a GeoJSON Point. Returns null if missing. */
function fromPoint(point) {
  if (!point || !Array.isArray(point.coordinates) || point.coordinates.length !== 2) return null;
  return { lat: point.coordinates[1], lng: point.coordinates[0] };
}

/** Great-circle distance in metres between two { lat, lng } objects. */
function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const metersToKm = (m) => Math.round((m / 1000) * 10) / 10;

/** Rough ETA in minutes when the routing API is unavailable (assumes 30 km/h). */
function fallbackEtaMinutes(meters, speedKmh = 30) {
  return Math.max(1, Math.round((meters / 1000 / speedKmh) * 60));
}

module.exports = {
  isValidCoords,
  toPoint,
  fromPoint,
  haversineMeters,
  metersToKm,
  fallbackEtaMinutes,
};
