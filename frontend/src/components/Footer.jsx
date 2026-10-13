import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { role } = useAuth();
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <strong>{t('Vehicle Breakdown Assistant')}</strong>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {t('Roadside help, 24 hours')} &copy; {new Date().getFullYear()}
          </p>
        </div>
        <ul aria-label="Footer links">
          <li><Link to="/book">{t('Get help')}</Link></li>
          <li><Link to="/track">{t('Track booking')}</Link></li>
          <li><Link to="/about">{t('About')}</Link></li>
          <li><Link to="/contact">{t('Contact')}</Link></li>
          {!role && <li><Link to="/driver/login">{t('Driver login')}</Link></li>}
          {!role && <li><Link to="/admin/login">{t('Admin login')}</Link></li>}
        </ul>
      </div>
    </footer>
  );
}
