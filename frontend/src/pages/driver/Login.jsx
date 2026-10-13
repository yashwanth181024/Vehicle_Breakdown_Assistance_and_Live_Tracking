import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HOME_PATH, useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api/axios';

export default function DriverLogin() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.token && auth.role) return <Navigate to={HOME_PATH[auth.role] || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError('Enter your username and password.');
    setBusy(true);
    setError('');
    try {
      await auth.login('driver', username, password);
      navigate((location.state && location.state.from) || '/driver', { replace: true });
    } catch (err) {
      setError(err.response && err.response.status === 401 ? 'Wrong username or password.' : getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 440 }}>
      <div className="page-head"><h1>Driver login</h1></div>
      <form className="card stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="dr-user">Username</label>
          <input id="dr-user" type="text" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="dr-pass">Password</label>
          <input id="dr-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
        <p className="small muted" style={{ margin: 0 }}>Your account is created by the admin. Ask them if you have lost your password.</p>
      </form>
    </div>
  );
}
