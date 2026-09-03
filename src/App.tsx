import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminCompanies from '@/pages/admin/AdminCompanies';
import AdminLibrary from '@/pages/admin/AdminLibrary';
import AdminUpload from '@/pages/admin/AdminUpload';
import AdminReviewList from '@/pages/admin/AdminReviewList';
import AdminReviewDetail from '@/pages/admin/AdminReviewDetail';
import VAPortal from '@/pages/VAPortal';

function RootRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm animate-pulse">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />

          <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="companies" element={<AdminCompanies />} />
            <Route path="library" element={<AdminLibrary />} />
            <Route path="upload" element={<AdminUpload />} />
            <Route path="review" element={<AdminReviewList />} />
            <Route path="review/:id" element={<AdminReviewDetail />} />
          </Route>

          <Route path="/portal" element={<VAPortal />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
