import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { BaseTiles, pickupIcon } from './TrackingMap';

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bengaluru, only used until the person picks a spot
const GEO_ERRORS = {
  1: 'Location access is blocked. Allow it in your browser settings, or tap the map to place the pin.',
  2: 'Your device could not work out where you are. Tap the map to place the pin instead.',
  3: 'Finding your location took too long. Try again, or tap the map to place the pin.',
};

async function reverseGeocode(lat, lng, signal) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=en`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('reverse failed');
  const data = await res.json();
  return data.display_name || '';
}

async function searchPlace(query, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('search failed');
  const list = await res.json();
  return list[0] ? { lat: Number(list[0].lat), lng: Number(list[0].lon), name: list[0].display_name } : null;
}

function ClickToPlace({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [target && target.lat, target && target.lng, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Where is the vehicle? "Use my location", search for a place, tap the map, or drag the pin.
 *   value:    { lat, lng } | null          onChange({ lat, lng })
 *   address:  text shown in the address box   onAddressChange(text)
 * The address box fills itself from the pin, but never overwrites something the person typed.
 */
export default function LocationPicker({ value, onChange, address, onAddressChange, error }) {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);
  const autoFilled = useRef(true); // true while the address text is blank or was written by us
  const lastAuto = useRef('');
  const controller = useRef(null);

  useEffect(() => {
    if (address && address !== lastAuto.current) autoFilled.current = false;
    if (!address) autoFilled.current = true;
  }, [address]);

  const fillAddress = useCallback(
    async (pos) => {
      if (!autoFilled.current) return;
      if (controller.current) controller.current.abort();
      controller.current = new AbortController();
      try {
        const text = await reverseGeocode(pos.lat, pos.lng, controller.current.signal);
        if (text && autoFilled.current) {
          lastAuto.current = text;
          onAddressChange(text);
        }
      } catch { /* the person can type the address; not an error worth showing */ }
    },
    [onAddressChange]
  );

  const place = useCallback(
    (pos, { fly = false } = {}) => {
      onChange(pos);
      if (fly) setFlyTarget(pos);
      fillAddress(pos);
    },
    [onChange, fillAddress]
  );

  const useMyLocation = () => {
    setMessage('');
    if (!navigator.geolocation) {
      setMessage('This browser cannot share your location. Tap the map to place the pin.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        place({ lat: p.coords.latitude, lng: p.coords.longitude }, { fly: true });
      },
      (err) => {
        setLocating(false);
        let text = GEO_ERRORS[err.code] || GEO_ERRORS[2];
        if (err.code === 1 && window.isSecureContext === false) text = 'Your browser only shares location on secure (https) pages. Tap the map to place the pin.';
        setMessage(text);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const findAddress = async () => {
    const q = (address || '').trim();
    if (q.length < 3) {
      setMessage('Type a place or landmark first, then press Find.');
      return;
    }
    setSearching(true);
    setMessage('');
    try {
      const hit = await searchPlace(q, undefined);
      if (hit) {
        autoFilled.current = false;
        place({ lat: hit.lat, lng: hit.lng }, { fly: true });
      } else setMessage('Could not find that place. Try a nearby landmark, or tap the map.');
    } catch {
      setMessage('Place search is not reachable right now. Tap the map to place the pin.');
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => () => controller.current && controller.current.abort(), []);

  const center = value || DEFAULT_CENTER;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="pickup-address">Where are you?</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="pickup-address"
            type="text"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findAddress(); } }}
            placeholder="Landmark, road or area"
            maxLength={250}
            aria-invalid={Boolean(error)}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-outline" onClick={findAddress} disabled={searching}>{searching ? '…' : 'Find'}</button>
        </div>
        {error && <p className="small" role="alert" style={{ color: 'var(--danger)', margin: '4px 0 0' }}>{error}</p>}
      </div>

      <button type="button" className="btn btn-signal btn-block" onClick={useMyLocation} disabled={locating}>
        {locating ? 'Finding you…' : value ? 'Update with my current location' : 'Use my current location'}
      </button>
      {message && <p className="notice notice-warn" role="alert" style={{ margin: 0 }}>{message}</p>}

      <div className="map-box" role="region" aria-label="Map. Tap to place the pin where your vehicle is.">
        <MapContainer center={[center.lat, center.lng]} zoom={value ? 16 : 11} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <BaseTiles />
          <ClickToPlace onPick={(pos) => place(pos)} />
          <FlyTo target={flyTarget} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pickupIcon}
              draggable
              eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); place({ lat: ll.lat, lng: ll.lng }); } }}
            />
          )}
        </MapContainer>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {value ? `Pin at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}. Drag it to fine-tune.` : 'No pin yet. Use your location, search, or tap the map.'}
      </p>
    </div>
  );
}
