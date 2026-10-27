import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isKnownRole } from '../config/access';
import { loginDestination } from '../utils/loginDestination';

export function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  return user ? <Navigate to={loginDestination(user, location.state?.from)} replace /> : <Outlet />;
}

export function ProtectedRoute({ roles }) {
  const { user, loading, sessionRecoveryRequired, sessionError, restoreSession } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  if (sessionRecoveryRequired) return <div className="route-state" role="alert"><p>{sessionError}</p><button className="button primary" onClick={restoreSession}>Retomar sessão</button></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !isKnownRole(user.role)) return <Navigate to="/unknown-profile" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

export function AuthLoading() {
  return <div className="auth-loading" role="status"><span className="brand-mark">Á</span><p>Restaurando sessão...</p></div>;
}
