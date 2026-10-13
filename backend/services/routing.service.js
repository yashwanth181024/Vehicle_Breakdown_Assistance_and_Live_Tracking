const axios = require('axios');
const { haversineMeters, fallbackEtaMinutes } = require('../utils/geo');

const CACHE_TTL_MS = 15 * 1000; // protects the free public OSRM server from polling
const cache = new Map();

const osrmUrl = () => (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const round = (n) => Math.round(n * 1e4) / 1e4; // ~11 m, good enough as a cache key

/**
 * Driving route between two { lat, lng } points.
 * Returns { distanceMeters, durationSeconds, etaMinutes, path: [[lat,lng],...], approximate }.
 * If OSRM is down, returns a straight line with a rough ETA and approximate: true.
 */
async function getRoute(from, to) {
  const key = [from.lat, from.lng, to.lat, to.lng].map(round).join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let value;
  try {
    const url = `${osrmUrl()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`;
    const { data } = await axios.get(url, {
      params: { overview: 'full', geometries: 'geojson' },
      timeout: 6000,
    });
    const route = data.routes && data.routes[0];
    if (data.code !== 'Ok' || !route) throw new Error(`OSRM: ${data.code || 'no route'}`);
    value = {
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      etaMinutes: Math.max(1, Math.round(route.duration / 60)),
      path: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), // Leaflet wants [lat, lng]
      approximate: false,
    };
  } catch (err) {
    const meters = Math.round(haversineMeters(from, to));
    const etaMinutes = fallbackEtaMinutes(meters);
    value = {
      distanceMeters: meters,
      durationSeconds: etaMinutes * 60,
      etaMinutes,
      path: [[from.lat, from.lng], [to.lat, to.lng]],
      approximate: true,
    };
  }

  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value); // keep memory bounded
  return value;
}

module.exports = { getRoute };
