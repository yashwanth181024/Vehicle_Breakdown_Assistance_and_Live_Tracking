import { Navigate, useLocation } from 'react-router-dom';
import { HOME_PATH, LOGIN_PATH, useAuth } from '../context/AuthContext';

/**
 * Only lets the right kind of staff member in.
 *   <ProtectedRoute role="admin"><Dashboard /></ProtectedRoute>
 * Signed out: goes to that role's login page and comes back afterwards.
 * Signed in as the other role: goes to their own home page.
 */
export default function ProtectedRoute({ role, children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) {
    return (
      <div className="loading" role="status">
        <div className="spinner" aria-hidden="true" />
        Checking your login
      </div>
    );
  }
  if (!auth.token) return <Navigate to={LOGIN_PATH[role]} replace state={{ from: location.pathname + location.search }} />;
  if (auth.role !== role) return <Navigate to={HOME_PATH[auth.role] || '/'} replace />;
  return children;
}
