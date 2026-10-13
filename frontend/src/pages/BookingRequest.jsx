import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage, rememberBooking } from '../api/axios';
import { useToast } from '../context/ToastContext';
import VoiceAssistant from '../components/VoiceAssistant';
import LocationPicker from '../components/LocationPicker';
import SosModal from '../components/SosModal';
import { SERVICE_TYPES, VEHICLE_TYPES, cleanPhone, isPhone } from '../utils/format';
import { parseBookingNumber, getTrackingUrl } from '../utils/booking';
import { useTranslation } from 'react-i18next';

const EMPTY = { name: '', phone: '', vehicleType: '', vehicleNumber: '', serviceType: '', description: '' };

/** One place that decides what is sent to the server. */
function buildPayload(form, pos, address) {
  return {
    name: form.name.trim(),
    phone: cleanPhone(form.phone),
    vehicleType: form.vehicleType,
    vehicleNumber: form.vehicleNumber.trim() || undefined,
    serviceType: form.serviceType,
    description: form.description.trim() || undefined,
    pickupLocation: address.trim(),
    pickupLat: pos.lat,
    pickupLng: pos.lng,
  };
}

function validate(form, pos, address) {
  const e = {};
  if (form.name.trim().length < 2) e.name = 'Please enter your name.';
  if (!isPhone(form.phone) || cleanPhone(form.phone).length !== 10) e.phone = 'Enter a 10-digit mobile number.';
  if (!form.vehicleType) e.vehicleType = 'Choose your vehicle.';
  if (!form.serviceType) e.serviceType = 'Choose what you need.';
  if (!pos) e.location = 'Place the pin where your vehicle is.';
  else if (address.trim().length < 3) e.location = 'Add a landmark or road name so the driver can find you.';
  return e;
}

export default function BookingRequest() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [pos, setPos] = useState(null);
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [triageInfo, setTriageInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchEstimate = async () => {
      if (!form.serviceType && form.description.length < 5) {
        setTriageInfo(null);
        setFareEstimate(null);
        return;
      }
      try {
        const tRes = await api.post('/bookings/triage', {
          serviceType: form.serviceType,
          description: form.description,
        });
        setTriageInfo(tRes.data.data);

        const sType = tRes.data.data?.serviceType || form.serviceType;
        if (sType) {
          const fRes = await api.post('/bookings/fare-estimate', {
            serviceType: sType,
            description: form.description,
            distanceKm: 0
          });
          setFareEstimate(fRes.data.data);
        }
      } catch (e) {
        console.error('Estimate failed', e);
      }
    };
    const timer = setTimeout(fetchEstimate, 800);
    return () => clearTimeout(timer);
  }, [form.serviceType, form.description]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const fromVoice = (f) => {
    setForm((cur) => ({
      ...cur,
      name: f.name || cur.name,
      phone: f.phone || cur.phone,
      serviceType: f.serviceType || cur.serviceType,
      vehicleType: f.vehicleType || cur.vehicleType,
      description: cur.description || f.description || '',
    }));
    if (f.pickupLocation && !address) setAddress(f.pickupLocation);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const found = validate(form, pos, address);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = document.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/bookings', buildPayload(form, pos, address));
      const d = res.data.data || {};
      const number = parseBookingNumber(d.bookingNumber ?? (d.booking && d.booking.bookingNumber));
      const phone = cleanPhone(form.phone);
      if (!number) throw new Error('The booking was saved but the server sent no booking number.');
      rememberBooking({ bookingNumber: number, phone });
      toast.success(`Request sent. Your booking number is ${number}.`);
      if (typeof Notification !== 'undefined' && Notification.requestPermission) {
        Notification.requestPermission().catch(() => {});
      }
      navigate(getTrackingUrl(number, phone), { replace: true });
    } catch (err) {
      setSubmitError(err.userMessage || getErrorMessage(err, err.message));
    } finally {
      setBusy(false);
    }
  };

  const err = (key) => errors[key] && <span className="field-error" role="alert">{errors[key]}</span>;

  return (
    <div className="container page" style={{ maxWidth: 820 }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('Get help now')}</h1>
          <p className="muted" style={{ margin: '5px 0 0 0' }}>{t('Tell us what happened and where you are. The nearest driver will be asked to come.')}</p>
        </div>
        <button type="button" onClick={() => setSosOpen(true)} className="btn" style={{ background: '#d32f2f', color: '#fff', fontSize: '1.2rem', padding: '10px 20px', borderColor: '#d32f2f' }}>{t('SOS EMERGENCY')}</button>
      </div>

      <form onSubmit={submit} noValidate className="stack" style={{ gap: 20 }}>
        <VoiceAssistant onResult={fromVoice} />

        <div className="card">
          <h2>{t('About you')}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="b-name">{t('Your name')}</label>
              <input id="b-name" type="text" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={Boolean(errors.name)} maxLength={80} />
              {err('name')}
            </div>
            <div className="field">
              <label htmlFor="b-phone">{t('Mobile number')}</label>
              <input id="b-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={set('phone')} aria-invalid={Boolean(errors.phone)} maxLength={15} />
              {err('phone')}
              <span className="hint">{t('The driver and you use this number to confirm the booking.')}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>{t('Your vehicle and the problem')}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="b-vehicle">{t('Vehicle')}</label>
              <select id="b-vehicle" value={form.vehicleType} onChange={set('vehicleType')} aria-invalid={Boolean(errors.vehicleType)}>
                <option value="">{t('Choose…')}</option>
                {VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}
              </select>
              {err('vehicleType')}
            </div>
            <div className="field">
              <label htmlFor="b-number">{t('Vehicle number')} <span className="optional">{t('(optional)')}</span></label>
              <input id="b-number" type="text" value={form.vehicleNumber} onChange={set('vehicleNumber')} maxLength={20} placeholder="KA 01 AB 1234" style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field full">
              <label htmlFor="b-service">{t('What do you need?')}</label>
              <select id="b-service" value={form.serviceType} onChange={set('serviceType')} aria-invalid={Boolean(errors.serviceType)}>
                <option value="">{t('Choose…')}</option>
                {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
              {err('serviceType')}
            </div>
            <div className="field full">
              <label htmlFor="b-desc">{t('Anything else we should know?')} <span className="optional">{t('(optional)')}</span></label>
              <textarea id="b-desc" value={form.description} onChange={set('description')} maxLength={500} />
              {triageInfo && (
                <div className="notice notice-info" style={{ marginTop: 8 }}>
                  <strong>{t('Auto-Triage:')}</strong> {t("We've categorized this as a priority issue")} <strong>{triageInfo.priority}</strong> ({triageInfo.serviceType}).
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>{t('Where is your vehicle?')}</h2>
          <LocationPicker value={pos} onChange={setPos} address={address} onAddressChange={setAddress} error={errors.location} />
        </div>

        {fareEstimate && fareEstimate.estimatedFare !== null && (
          <div className="notice notice-success" style={{ textAlign: 'center' }}>
            <strong>{t('Estimated Fare:')}</strong> ₹{fareEstimate.estimatedFare} ({t('Base:')} ₹{fareEstimate.basePrice})
          </div>
        )}

        {submitError && <p className="notice notice-error" role="alert">{submitError}</p>}
        <button className="btn btn-signal btn-block" type="submit" disabled={busy} style={{ minHeight: 54, fontSize: '1.1rem' }}>
          {busy ? t('Sending your request…') : t('Send request')}
        </button>
        <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>{t('If anyone is hurt, call 112 first.')}</p>
      </form>
      <SosModal isOpen={sosOpen} onClose={() => setSosOpen(false)} initialPhone={form.phone} />
    </div>
  );
}
