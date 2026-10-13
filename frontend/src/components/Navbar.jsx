import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useSocket from '../hooks/useSocket';
import { store } from '../api/axios';
import { useTranslation } from 'react-i18next';

const PUBLIC_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/book', label: 'Get help' },
  { to: '/track', label: 'Track booking' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];
const ADMIN_LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/requests', label: 'Requests' },
  { to: '/admin/drivers', label: 'Drivers' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/heatmap', label: 'Hotspots' },
];
const DRIVER_LINKS = [
  { to: '/driver', label: 'Dashboard', end: true },
  { to: '/driver/active', label: 'Current job' },
  { to: '/driver/jobs', label: 'My jobs' },
  { to: '/driver/earnings', label: 'Earnings' },
  { to: '/driver/location', label: 'Share location' },
];

function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0B4F9E" />
      <rect x="4" y="4" width="56" height="56" rx="11" fill="none" stroke="#fff" strokeWidth="2.5" />
      <path d="M32 14 L52 48 H12 Z" fill="#FFC72C" stroke="#15191E" strokeWidth="3" strokeLinejoin="round" />
      <rect x="30" y="26" width="4" height="11" rx="2" fill="#15191E" />
      <circle cx="32" cy="42" r="2.4" fill="#15191E" />
    </svg>
  );
}

function currentTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set) return set;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function Navbar() {
  const { role, user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(currentTheme);
  const { t, i18n } = useTranslation();

  // The menu closes whenever the person moves to another page
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const links = role === 'admin' ? ADMIN_LINKS : role === 'driver' ? DRIVER_LINKS : PUBLIC_LINKS;

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('vba_theme', next);
    setTheme(next);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link to={role ? `/${role}` : '/'} className="brand" aria-label="Vehicle Breakdown Assistant home">
          <Logo />
          <span className="brand-text">
            Breakdown Assistant
            <small>{role === 'admin' ? t('Admin') : role === 'driver' ? t('Driver') : t('Roadside help, 24 hours')}</small>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {t(l.label)}
            </NavLink>
          ))}
        </nav>

        <div className="nav-tools">
          {role && (
            <span className={`live-dot${connected ? ' on' : ''}`} title={connected ? 'Live updates are on' : 'Reconnecting to live updates'}>
              {connected ? 'Live' : 'Offline'}
            </span>
          )}
          {role && user && <span className="small muted desktop-only" style={{ padding: '0 6px' }}>{user.name}</span>}
          {!role && (
            <Link to="/book" className="btn btn-signal btn-sm desktop-only" style={{ fontSize: '1rem', minHeight: 40 }}>
              {t('Get help now')}
            </Link>
          )}
          {role && (
            <button type="button" className="btn btn-outline btn-sm desktop-only" onClick={handleLogout}>
              {t('Log out')}
            </button>
          )}
          <select 
            value={i18n.language.split('-')[0]} 
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={{ marginLeft: 8, padding: '4px', borderRadius: '4px', border: '1px solid #ccc', background: 'transparent', color: 'inherit' }}
            aria-label={t('language', 'Language')}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
            <option value="kn">ಕನ್ನಡ (Kannada)</option>
          </select>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          </button>
          <button
            type="button"
            className="icon-btn nav-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span aria-hidden="true">{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      <nav id="mobile-menu" className={`nav-menu${open ? ' open' : ''}`} aria-label="Mobile">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            {t(l.label)}
          </NavLink>
        ))}
        {role ? (
          <button type="button" className="link-btn" onClick={handleLogout}>
            {t('Log out')}{user ? ` (${user.name})` : ''}
          </button>
        ) : (
          <Link to="/book" className="btn btn-signal" style={{ marginTop: 12 }}>
            {t('Get help now')}
          </Link>
        )}
      </nav>
    </header>
  );
}
