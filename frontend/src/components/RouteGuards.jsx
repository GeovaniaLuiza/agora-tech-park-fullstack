import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { homeForRole, isKnownRole } from '../config/access';

export function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  return user ? <Navigate to={homeForRole(user.role)} replace /> : <Outlet />;
}

export function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !isKnownRole(user.role)) return <Navigate to="/unknown-profile" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

export function AuthLoading() {
  return <div className="auth-loading" role="status"><span className="brand-mark">Á</span><p>Restaurando sessão...</p></div>;
}
