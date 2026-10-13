import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

/**
 * Draws breakdown hotspots on a map. Place it inside a <MapContainer>.
 *   points: [{ lat, lng, count }]   from GET /analytics/heatmap
 *   max:    the biggest count, so colours scale to the data
 */
export default function HeatmapLayer({ points = [], max, radius = 28, blur = 20 }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return undefined;
    let layer;
    let cancelled = false;

    (async () => {
      // leaflet.heat looks for a global "L", so make it available before loading the plugin
      window.L = window.L || L;
      await import('leaflet.heat');
      if (cancelled) return;
      const peak = max || Math.max(...points.map((p) => p.count), 1);
      layer = window.L.heatLayer(
        points.map((p) => [p.lat, p.lng, p.count / peak]),
        { radius, blur, maxZoom: 15, minOpacity: 0.35 }
      ).addTo(map);
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, points, max, radius, blur]);

  return null;
}
