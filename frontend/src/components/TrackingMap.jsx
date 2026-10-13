import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { formatDistance, formatEta } from './EtaBadge';

/** Custom pins drawn with CSS/SVG, so no image files are needed (bundlers break Leaflet's default marker images). */
export const pickupIcon = L.divIcon({
  className: 'map-pin-wrap',
  html: '<div class="pickup-pin"></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

export const driverIcon = L.divIcon({
  className: 'map-pin-wrap',
  html:
    '<div class="driver-pin"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path d="M3 15V8h11v7M14 10h4l3 3v2h-7" fill="none" stroke="#15191e" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="7" cy="16.5" r="2" fill="#15191e"/><circle cx="17" cy="16.5" r="2" fill="#15191e"/></svg></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

/** Black round pin with a house, like the delivery apps use for "you are here". */
export const homeIcon = L.divIcon({
  className: 'map-pin-wrap',
  html:
    '<div class="home-pin"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="#fff"/></svg></div>',
  iconSize: [38, 46],
  iconAnchor: [19, 44],
});

/** Recovery vehicle in a white circle with a soft pulse, so the live position is easy to spot. */
export const truckIcon = L.divIcon({
  className: 'map-pin-wrap',
  html:
    '<div class="truck-pin"><span class="truck-pulse"></span><span class="truck-body"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path d="M2 16V8h11v8M13 11h4.5l3.5 3.5V16h-8" fill="none" stroke="#d62828" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="7" cy="17.5" r="2.2" fill="#d62828"/><circle cx="17" cy="17.5" r="2.2" fill="#d62828"/></svg></span></div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

// Light grey "street" look (like the reference map) and a matching dark one, from Esri's public basemaps.
// No API key needed. (CARTO's free tiles now demand a key, which is why they show "API KEY REQUIRED".)
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
export const TILE_URL = `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
export const TILE_LABELS_URL = `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`;
export const TILE_URL_DARK = `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
export const TILE_LABELS_URL_DARK = `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`;
export const TILE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

const prefersDark = () => {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/** True while the page is in dark mode; follows the theme toggle live. */
function useIsDark() {
  const [dark, setDark] = useState(prefersDark);
  useEffect(() => {
    const update = () => setDark(prefersDark());
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', update);
    return () => {
      obs.disconnect();
      if (mq && mq.removeEventListener) mq.removeEventListener('change', update);
    };
  }, []);
  return dark;
}

/** The map background: base tiles plus a transparent road/place-name layer. Follows light/dark mode. */
export function BaseTiles() {
  const dark = useIsDark();
  return (
    <>
      <TileLayer key={`b-${dark}`} url={dark ? TILE_URL_DARK : TILE_URL} attribution={TILE_ATTRIBUTION} maxNativeZoom={16} maxZoom={19} />
      <TileLayer key={`l-${dark}`} url={dark ? TILE_LABELS_URL_DARK : TILE_LABELS_URL} maxNativeZoom={16} maxZoom={19} />
    </>
  );
}

/** Zooms to show both points once, and again only if the pickup point itself changes. */
function FitToPoints({ pickup, driver }) {
  const map = useMap();
  const hasDriver = Boolean(driver);
  const key = pickup ? `${pickup.lat},${pickup.lng}` : '';

  useEffect(() => {
    if (!pickup) return;
    if (driver) map.fitBounds(L.latLngBounds([pickup.lat, pickup.lng], [driver.lat, driver.lng]), { padding: [60, 60], maxZoom: 16 });
    else map.setView([pickup.lat, pickup.lng], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasDriver, map]);
  return null;
}

/** Keeps a moving driver on screen without fighting the person if they zoom or drag the map. */
function KeepDriverInView({ driver }) {
  const map = useMap();
  useEffect(() => {
    if (!driver) return;
    const inner = map.getBounds().pad(-0.12);
    if (!inner.contains([driver.lat, driver.lng])) map.panTo([driver.lat, driver.lng]);
  }, [driver && driver.lat, driver && driver.lng, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 *   pickup: { lat, lng }              where the customer is
 *   driver: { lat, lng } | null       live position
 *   path:   [[lat, lng], ...] | null  route from the route endpoint
 *   eta:    { minutes, meters, approximate, waiting } | null   shows the green status banner above the map
 *   title:  banner heading, e.g. "Driver is on the way"
 *   onRefresh: () => void             adds the refresh button to the banner
 */
export default function TrackingMap({
  pickup,
  driver = null,
  path = null,
  hidePickup = false,
  className = '',
  label = 'Map showing the driver and your pickup point',
  eta = null,
  title = '',
  onRefresh = null,
}) {
  const { t } = useTranslation();
  const dark = useIsDark();
  const [map, setMap] = useState(null);
  const [full, setFull] = useState(false);
  const [spin, setSpin] = useState(false);
  const center = useMemo(() => (pickup ? [pickup.lat, pickup.lng] : [12.9716, 77.5946]), [pickup]);
  const hasPath = Array.isArray(path) && path.length > 1;
  const styled = Boolean(eta); // the tracking look: round home pin, vehicle, blue route

  // Resize the map after entering/leaving full screen; allow wheel zoom only while full screen; Esc closes it.
  useEffect(() => {
    if (!map) return undefined;
    if (full) map.scrollWheelZoom.enable(); else map.scrollWheelZoom.disable();
    const id = setTimeout(() => map.invalidateSize(), 60);
    if (!full) return () => clearTimeout(id);
    const onKey = (e) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(id);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [full, map]);

  const recenter = useCallback(() => {
    if (!map || !pickup) return;
    if (driver) map.fitBounds(L.latLngBounds([pickup.lat, pickup.lng], [driver.lat, driver.lng]), { padding: [60, 60], maxZoom: 16 });
    else map.setView([pickup.lat, pickup.lng], 15);
  }, [map, pickup, driver]);

  const refresh = () => {
    if (onRefresh) onRefresh();
    setSpin(true);
    setTimeout(() => setSpin(false), 800);
  };

  let pill = '';
  if (eta) {
    if (eta.waiting || eta.minutes == null) pill = t("Waiting for the driver's location");
    else pill = `${eta.approximate ? '~' : ''}${formatEta(eta.minutes)}${eta.meters != null ? ` \u2022 ${formatDistance(eta.meters)} ${t('away')}` : ''}`;
  }

  return (
    <div className={`live-map${full ? ' is-full' : ''}`}>
      {eta && (
        <div className="live-banner" role="status" aria-live="polite">
          <div className="live-banner-title">{title}</div>
          <div className="live-banner-row">
            <span className="live-pill">{pill}</span>
            {onRefresh && (
              <button type="button" className={`live-pill live-refresh${spin ? ' spin' : ''}`} onClick={refresh} aria-label={t('Refresh')}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`map-box carto ${className}`} role="region" aria-label={label}>
        <MapContainer ref={setMap} center={center} zoom={14} scrollWheelZoom={false} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <BaseTiles />
          {hasPath && (
            <>
              <Polyline positions={path} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
              <Polyline positions={path} pathOptions={{ color: styled ? '#2f6df6' : '#0b4f9e', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
            </>
          )}
          {pickup && !hidePickup && (
            <Marker position={[pickup.lat, pickup.lng]} icon={styled ? homeIcon : pickupIcon}>
              <Popup>{t('Pickup point')}</Popup>
            </Marker>
          )}
          {driver && (
            <Marker position={[driver.lat, driver.lng]} icon={styled ? truckIcon : driverIcon} zIndexOffset={500}>
              <Popup>{t('Your driver')}</Popup>
            </Marker>
          )}
          <FitToPoints pickup={pickup} driver={driver} />
          <KeepDriverInView driver={driver} />
        </MapContainer>

        <div className="map-ctl map-ctl-top">
          <button type="button" className="map-btn" onClick={() => setFull((f) => !f)} aria-label={full ? t('Exit full screen') : t('Full screen')}>
            {full ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </button>
        </div>
        <div className="map-ctl map-ctl-bottom">
          <button type="button" className="map-btn map-btn-round" onClick={recenter} aria-label={t('Recenter map')}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="map-zoom">
          <button type="button" className="map-btn" onClick={() => map && map.zoomIn()} aria-label={t('Zoom in')}>+</button>
          <button type="button" className="map-btn" onClick={() => map && map.zoomOut()} aria-label={t('Zoom out')}>{'\u2212'}</button>
        </div>
      </div>
    </div>
  );
}
