import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { rememberBooking } from '../api/axios';
import { useToast } from '../context/ToastContext';
import { cleanPhone, isPhone } from '../utils/format';
import { getTrackingUrl } from '../utils/booking';

export default function SosModal({ isOpen, onClose, initialPhone = '' }) {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [countdown, setCountdown] = useState(10);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCountdown(10);
    setError('');
    if (initialPhone) setPhone(initialPhone);
  }, [isOpen, initialPhone]);

  useEffect(() => {
    if (!isOpen || countdown <= 0 || busy || error) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [isOpen, countdown, busy, error]);

  useEffect(() => {
    if (isOpen && countdown === 0 && !busy && !error) {
      fireSos();
    }
  }, [countdown, isOpen, busy, error]);

  const fireSos = async () => {
    const p = cleanPhone(phone);
    if (!isPhone(p) || p.length !== 10) {
      setError('A valid 10-digit phone number is required to send SOS.');
      return;
    }
    
    setBusy(true);
    try {
      let lat = 0, lng = 0;
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (e) {
        console.warn('Geolocation failed for SOS', e);
      }
      
      const res = await api.post('/bookings/sos', {
        phone: p,
        pickupLat: lat,
        pickupLng: lng,
        pickupLocation: 'Emergency SOS Location',
      });
      
      const number = res.data.data.bookingNumber;
      rememberBooking({ bookingNumber: number, phone: p });
      toast.success('SOS Request Sent!');
      onClose();
      navigate(getTrackingUrl(number, p), { replace: true });
    } catch (err) {
      setError(err.userMessage || 'Failed to send SOS.');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: 500, width: '90%', border: '2px solid red', background: '#fff', color: '#000' }}>
        <h2 style={{ color: 'red', marginTop: 0 }}>EMERGENCY SOS</h2>
        <p className="notice notice-error" style={{ fontSize: '0.9rem', marginBottom: '15px' }}>
          <strong>PROTOTYPE WARNING:</strong> This does not replace official emergency services. 
          Do not rely on this for real emergencies.
        </p>
        
        <div style={{ display: 'flex', gap: 10, margin: '20px 0' }}>
          <a href="tel:112" className="btn btn-primary" style={{ flex: 1, background: '#d32f2f', textAlign: 'center', borderColor: '#d32f2f' }}>Call 112 (Police/Fire)</a>
          <a href="tel:108" className="btn btn-primary" style={{ flex: 1, background: '#d32f2f', textAlign: 'center', borderColor: '#d32f2f' }}>Call 108 (Ambulance)</a>
        </div>

        {error ? (
          <p className="field-error" style={{ textAlign: 'center', fontWeight: 'bold' }}>{error}</p>
        ) : (
          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <h1 style={{ fontSize: '4rem', color: 'red', margin: 0, lineHeight: 1 }}>{countdown}</h1>
            <p style={{ margin: 0, fontWeight: 'bold' }}>Sending SOS automatically...</p>
          </div>
        )}

        <div className="form-grid" style={{ marginBottom: 20 }}>
          <div className="field full">
            <label style={{ color: '#333' }}>Your Phone Number (Required)</label>
            <input type="tel" value={phone} onChange={e => { setPhone(e.target.value); setError(''); }} disabled={busy} placeholder="10-digit mobile" />
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancel SOS</button>
          <button className="btn btn-signal" onClick={fireSos} disabled={busy} style={{ flex: 1, background: 'red' }}>
            {busy ? 'Sending...' : 'Send SOS Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
