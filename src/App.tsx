import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminCompanies from '@/pages/admin/AdminCompanies';
import AdminAMS from '@/pages/admin/AdminAMS';
import AdminCategories from '@/pages/admin/AdminCategories';
import AdminLibrary from '@/pages/admin/AdminLibrary';
import AdminUpload from '@/pages/admin/AdminUpload';
import AdminReviewList from '@/pages/admin/AdminReviewList';
import AdminReviewDetail from '@/pages/admin/AdminReviewDetail';
import AdminAnalytics from '@/pages/admin/AdminAnalytics';
import VAPortal from '@/pages/VAPortal';
import VASubmitSOP from '@/pages/VASubmitSOP';

function RootRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-ink flex items-center justify-center text-slate-500 text-sm animate-pulse">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<RootRedirect />} />

          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="companies" element={<AdminCompanies />} />
            <Route path="ams" element={<AdminAMS />} />
            <Route path="companies/:companyId/categories" element={<AdminCategories />} />
            <Route path="library" element={<AdminLibrary />} />
            <Route path="upload" element={<AdminUpload />} />
            <Route path="review" element={<AdminReviewList />} />
            <Route path="review/:id" element={<AdminReviewDetail />} />
            <Route path="analytics" element={<AdminAnalytics />} />
          </Route>

          <Route path="/portal" element={<ProtectedRoute><VAPortal /></ProtectedRoute>} />
          <Route path="/portal/submit" element={<ProtectedRoute><VASubmitSOP /></ProtectedRoute>} />
          <Route path="/portal/:category" element={<ProtectedRoute><VAPortal /></ProtectedRoute>} />
          <Route path="/portal/:category/:companyId" element={<ProtectedRoute><VAPortal /></ProtectedRoute>} />
          <Route path="/portal/:category/:companyId/:workflowCategoryId" element={<ProtectedRoute><VAPortal /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
