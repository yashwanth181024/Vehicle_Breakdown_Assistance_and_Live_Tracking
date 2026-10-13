import { useState } from 'react';
import api, { getErrorMessage } from '../api/axios';

/**
 * "Share live location" for the customer. Asks the server for a private link that shows only the map
 * (no phone number, no chat), then lets the person copy it or send it on WhatsApp.
 */
export default function ShareLinkButton({ bookingNumber, phone }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/bookings/${bookingNumber}/share`, { phone });
      const d = res.data.data || {};
      // The server may return a full url or just the token; build from this site's address so it always opens here
      const url = d.token ? `${window.location.origin}/share/${d.token}` : d.url;
      setLink(url);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create the link.'));
    } finally {
      setBusy(false);
    }
  };

  const message = `Follow my roadside help live: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setNote('Link copied.');
    } catch {
      setNote('Press and hold the link to copy it.');
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'Live roadside help', text: 'Follow my roadside help live', url: link });
    } catch { /* closed by the person */ }
  };

  if (!link) {
    return (
      <div>
        <button type="button" className="btn btn-outline" onClick={make} disabled={busy}>
          {busy ? 'Creating link…' : 'Share live location'}
        </button>
        {error && <p className="small" role="alert" style={{ color: 'var(--danger)', margin: '6px 0 0' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input type="text" readOnly value={link} aria-label="Share link" onFocus={(e) => e.target.select()} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={copy}>Copy link</button>
        <a className="btn btn-sm btn-ok" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        {typeof navigator !== 'undefined' && navigator.share && (
          <button type="button" className="btn btn-sm btn-outline" onClick={nativeShare}>More…</button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{note || 'Anyone with this link can see the map until the job ends. They cannot see your phone number or chat.'}</p>
    </div>
  );
}
