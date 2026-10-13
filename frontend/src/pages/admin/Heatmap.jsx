import { useEffect, useMemo, useState } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import api, { getErrorMessage } from '../../api/axios';
import HeatmapLayer from '../../components/HeatmapLayer';
import { BaseTiles } from '../../components/TrackingMap';
import { toPoint } from '../../utils/booking';
import { listOf, num } from '../../utils/adapt';

function FitTo({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 14 });
  }, [points, map]);
  return null;
}

/** Where breakdowns happen most. Brighter means more requests. */
export default function Heatmap() {
  const [days, setDays] = useState(90);
  const [raw, setRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/analytics/heatmap', { params: { days } })
      .then((res) => { if (alive) { setRaw(listOf(res.data.data, 'points', 'hotspots')); setError(''); } })
      .catch((err) => alive && setError(getErrorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [days]);

  const points = useMemo(
    () => raw.map((r) => {
      const p = toPoint(r);
      return p ? { ...p, count: num(r.count ?? r.weight ?? r.value, 1) || 1 } : null;
    }).filter(Boolean),
    [raw]
  );
  const max = points.reduce((m, p) => Math.max(m, p.count), 1);
  const total = points.reduce((s, p) => s + p.count, 0);
  const top = [...points].sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <div className="container page">
      <div className="page-head">
        <div><h1>Hotspots</h1><p className="muted">{points.length ? `${total} requests across ${points.length} spots` : ' '}</p></div>
        <div className="chips" role="group" aria-label="Period">
          {[30, 90, 365].map((d) => <button key={d} type="button" className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>{d === 365 ? 'Year' : `${d} days`}</button>)}
        </div>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading ? <div className="loading" role="status"><div className="spinner" aria-hidden="true" />Loading</div> : points.length === 0 ? (
        <p className="empty">No requests with a location in this period.</p>
      ) : (
        <div className="split">
          <div className="map-box tall" role="region" aria-label="Heat map of breakdown locations">
            <MapContainer center={[points[0].lat, points[0].lng]} zoom={11} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
              <BaseTiles />
              <HeatmapLayer points={points} max={max} />
              <FitTo points={points} />
            </MapContainer>
          </div>
          <div className="card">
            <h2>Busiest spots</h2>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {top.map((p) => (
                <li key={`${p.lat},${p.lng}`} style={{ marginBottom: 6 }}>
                  <strong>{p.count} request{p.count > 1 ? 's' : ''}</strong>
                  <div className="small muted">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
