import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRememberedBooking } from '../api/axios';
import { getTrackingUrl } from '../utils/booking';
import { SERVICE_TYPES } from '../utils/format';
import SosModal from '../components/SosModal';
import { useTranslation } from 'react-i18next';

const STEPS = [
  ['Tell us what happened', 'Type it, say it in your language, or add a photo. Share your location with one tap.'],
  ['The nearest driver is asked', 'Drivers close to you get the request and have one minute to accept.'],
  ['Follow them to you', 'Watch the driver on the map with an arrival time, and chat if you need to.'],
];

export default function Home() {
  const navigate = useNavigate();
  const remembered = getRememberedBooking();
  const [number, setNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [sosOpen, setSosOpen] = useState(false);
  const { t, i18n } = useTranslation();

  const track = (e) => {
    e.preventDefault();
    navigate(getTrackingUrl(number.trim(), phone.trim()));
  };

  return (
    <>
      <section className="container page hero">
        <div className="hero-grid">
          <div className="sign" style={{ padding: 28 }}>
            <h1 style={{ fontSize: i18n.language !== 'en' ? 'clamp(1.8rem, 4vw, 2.5rem)' : undefined }}>{t('hero_title')}</h1>
            <p style={{ fontSize: '1.1rem' }}>
              {t('hero_subtitle')}
            </p>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              <Link to="/book" className="btn btn-signal">{t('Get help now')}</Link>
              <button onClick={() => setSosOpen(true)} className="btn" style={{ background: '#d32f2f', color: '#fff', borderColor: '#d32f2f' }}>{t('SOS Emergency')}</button>
              <Link to="/track" className="btn btn-outline" style={{ background: 'transparent', color: 'inherit', borderColor: 'currentColor' }}>{t('Track my booking')}</Link>
            </div>
          </div>

          <div className="card">
            <h2>{t('Already booked?')}</h2>
            {remembered && (
              <p>
                <Link className="btn btn-primary btn-block" to={getTrackingUrl(remembered.bookingNumber, remembered.phone)}>
                  {t('Open booking #')}{remembered.bookingNumber}
                </Link>
              </p>
            )}
            <form onSubmit={track} className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor="home-number">{t('Booking number')}</label>
                <input id="home-number" type="text" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="home-phone">{t('Phone number')}</label>
                <input id="home-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <button className="btn btn-primary" type="submit">{t('Track')}</button>
            </form>
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <h2>{t('How it works')}</h2>
        <ol className="step-list">
          <li>
            <span className="num">1</span>
            <div><strong>{t('step1_title')}</strong><p className="muted" style={{ margin: '2px 0 0' }}>{t('step1_text')}</p></div>
          </li>
          <li>
            <span className="num">2</span>
            <div><strong>{t('step2_title')}</strong><p className="muted" style={{ margin: '2px 0 0' }}>{t('step2_text')}</p></div>
          </li>
          <li>
            <span className="num">3</span>
            <div><strong>{t('step3_title')}</strong><p className="muted" style={{ margin: '2px 0 0' }}>{t('step3_text')}</p></div>
          </li>
        </ol>
      </section>

      <section className="container" style={{ paddingBottom: 56 }}>
        <h2>{t('What we can help with')}</h2>
        <div className="chips">
          {SERVICE_TYPES.map((s) => <Link key={s} to="/book" className="chip">{s}</Link>)}
        </div>
      </section>
      <SosModal isOpen={sosOpen} onClose={() => setSosOpen(false)} />
    </>
  );
}
