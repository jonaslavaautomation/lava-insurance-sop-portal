import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, Library, Upload, FileCheck, LogOut, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LavaLogo } from '@/components/LavaLogo';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/companies', label: 'Insurance Companies', icon: Building2 },
  { to: '/admin/library', label: 'SOP Library', icon: Library },
  { to: '/admin/upload', label: 'Upload SOP', icon: Upload },
  { to: '/admin/review', label: 'Pending Reviews', icon: FileCheck },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-zinc-900 text-zinc-300 flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <LavaLogo className="w-9 h-9 rounded-lg" />
            <div>
              <p className="text-white font-semibold text-sm">LAVA Automation</p>
              <p className="text-zinc-500 text-xs">Admin Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}

          <a
            href="/portal"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            VA Portal
          </a>
        </nav>

        <div className="px-3 py-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center text-xs font-medium text-white">
              {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{profile?.full_name || 'Admin'}</p>
              <p className="text-zinc-500 text-xs truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
