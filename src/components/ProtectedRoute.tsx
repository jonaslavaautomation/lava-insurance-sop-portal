import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
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

  // Signing in (Google/SSO included) only proves who someone is, not that
  // they're an admin — new accounts default to va_student. Anyone who is
  // authenticated but not an admin gets sent to the public VA portal instead
  // of the admin dashboard.
  if (profile && profile.role !== 'admin') {
    return <Navigate to="/portal" replace />;
  }

  return <>{children}</>;
}
