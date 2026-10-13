import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HOME_PATH, useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api/axios';

export default function AdminLogin() {
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
      await auth.login('admin', username, password);
      navigate((location.state && location.state.from) || '/admin', { replace: true });
    } catch (err) {
      setError(err.response && err.response.status === 401 ? 'Wrong username or password.' : getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 440 }}>
      <div className="page-head"><h1>Admin login</h1></div>
      <form className="card stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="a-user">Username</label>
          <input id="a-user" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="a-pass">Password</label>
          <input id="a-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
    </div>
  );
}
