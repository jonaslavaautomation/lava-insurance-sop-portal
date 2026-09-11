import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Library, Upload, FileCheck, LogOut, ExternalLink,
  BarChart3, Search, Settings, CircleUser,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LavaLogo } from '@/components/LavaLogo';
import { CommandPalette } from '@/components/admin/CommandPalette';
import { supabase } from '@/lib/supabase';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, countKey: null },
  { to: '/admin/companies', label: 'Insurance Companies', icon: Building2, end: false, countKey: 'companies' as const },
  { to: '/admin/library', label: 'SOP Library', icon: Library, end: false, countKey: 'documents' as const },
  { to: '/admin/upload', label: 'Upload SOP', icon: Upload, end: false, countKey: null },
  { to: '/admin/review', label: 'Pending Reviews', icon: FileCheck, end: false, countKey: 'pending' as const },
  { to: '/admin/analytics', label: 'SOP Analytics', icon: BarChart3, end: false, countKey: null },
];

const BREADCRUMB_LABELS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/companies': 'Insurance Companies',
  '/admin/library': 'SOP Library',
  '/admin/upload': 'Upload SOP',
  '/admin/review': 'Pending Reviews',
  '/admin/analytics': 'SOP Analytics',
};

function breadcrumbFor(pathname: string): string {
  if (BREADCRUMB_LABELS[pathname]) return BREADCRUMB_LABELS[pathname];
  if (pathname.startsWith('/admin/review/')) return 'Review SOP';
  return 'Dashboard';
}

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [counts, setCounts] = useState<{ companies: number; documents: number; pending: number }>({
    companies: 0, documents: 0, pending: 0,
  });
  const [systemOk, setSystemOk] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ count: companies, error: e1 }, { count: documents, error: e2 }, { count: pending, error: e3 }] = await Promise.all([
        supabase.from('insurance_companies').select('*', { count: 'exact', head: true }),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      setCounts({ companies: companies ?? 0, documents: documents ?? 0, pending: pending ?? 0 });
      setSystemOk(!e1 && !e2 && !e3);
    }
    load();
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex bg-ink text-slate-200">
      <aside className="w-60 bg-ink-secondary border-r border-white/[0.06] flex flex-col flex-shrink-0">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <LavaLogo className="w-8 h-8 rounded-lg" />
            <div className="min-w-0">
              <p className="text-slate-50 font-semibold text-sm leading-tight truncate">LAVA Automation</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
                </span>
                <span className="text-[10px] font-mono text-slate-500">System Online · v2.4.0</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {navItems.map((item) => {
            const count = item.countKey ? counts[item.countKey] : null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-md text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-brand-600/15 text-slate-50'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-500" />}
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-400' : ''}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count !== null && (
                      <span className="text-[10px] font-mono text-slate-500 tabular-nums">{count}</span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}

          <a
            href="/portal"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-md text-[13px] font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] transition-all"
          >
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            VA Portal
          </a>
        </nav>

        <div className="px-2.5 py-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 bg-white/[0.06] rounded-full flex items-center justify-center text-[11px] font-medium text-slate-200">
                {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'A'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-ink-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-slate-100 text-[13px] font-medium truncate">{profile?.full_name || 'Admin'}</p>
              <p className="text-slate-500 text-[10px] truncate">Admin</p>
            </div>
            <CircleUser className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" aria-hidden="true" />
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 flex-shrink-0 border-b border-white/[0.06] bg-ink-secondary/60 backdrop-blur-sm flex items-center px-5 gap-4">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 flex-shrink-0">
            <span>Admin</span>
            <span className="text-slate-700">/</span>
            <span className="text-slate-200 font-medium">{breadcrumbFor(location.pathname)}</span>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex-1 max-w-md flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] text-slate-500 text-[13px] hover:border-white/[0.15] hover:text-slate-400 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left truncate">Search SOPs, carriers...</span>
            <kbd className="text-[10px] font-mono border border-white/10 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>

          <div className="flex-1" />

          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-slate-500 flex-shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${systemOk === false ? 'bg-red-400' : 'bg-emerald-400'}`} />
            {systemOk === false ? 'Degraded' : 'Operational'}
          </div>

          <button
            onClick={() => navigate('/admin/upload')}
            className="flex-shrink-0 flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-[13px] font-medium px-3.5 py-1.5 rounded-md transition-colors shadow-[0_0_0_1px_rgba(225,29,72,0.4),0_0_16px_-4px_rgba(255,42,95,0.6)]"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload SOP
          </button>

          <button
            className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
