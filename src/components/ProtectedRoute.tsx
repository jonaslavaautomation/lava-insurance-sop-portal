import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Require role === 'admin', not just any signed-in session. */
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, adminOnly = false }: Props) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Signing in (Google included) only proves who someone is, not that
  // they're an admin — new accounts default to va_student. Anyone who is
  // authenticated but not an admin gets sent to the VA portal instead of
  // the admin dashboard.
  if (adminOnly && profile && profile.role !== 'admin') {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}
