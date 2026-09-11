import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Library, Upload, FileCheck, LogOut, ExternalLink,
  BarChart3, Search, Settings, PanelLeft, Plus, Clock, ChevronDown, ChevronRight, User,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LavaLogo } from '@/components/LavaLogo';
import { CommandPalette } from '@/components/admin/CommandPalette';
import { supabase, type SopDocument } from '@/lib/supabase';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, countKey: null },
  { to: '/admin/companies', label: 'Insurance Companies', icon: Building2, end: false, countKey: 'companies' as const },
  { to: '/admin/library', label: 'SOP Library', icon: Library, end: false, countKey: 'documents' as const },
  { to: '/admin/upload', label: 'Upload SOP', icon: Upload, end: false, countKey: null },
  { to: '/admin/review', label: 'Pending Reviews', icon: FileCheck, end: false, countKey: 'pending' as const, alert: true },
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

const COLLAPSE_KEY = 'lava-sidebar-collapsed';
const RECENTS_KEY = 'lava-sidebar-recents-open';

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [counts, setCounts] = useState<{ companies: number; documents: number; pending: number }>({
    companies: 0, documents: 0, pending: 0,
  });
  const [recentDocs, setRecentDocs] = useState<SopDocument[]>([]);
  const [systemOk, setSystemOk] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readBoolPref(COLLAPSE_KEY, false));
  const [recentsOpen, setRecentsOpen] = useState(() => readBoolPref(RECENTS_KEY, true));
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const [
        { count: companies, error: e1 },
        { count: documents, error: e2 },
        { count: pending, error: e3 },
        { data: recent },
      ] = await Promise.all([
        supabase.from('insurance_companies').select('*', { count: 'exact', head: true }),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('sop_documents').select('*').order('created_at', { ascending: false }).limit(5),
      ]);
      setCounts({ companies: companies ?? 0, documents: documents ?? 0, pending: pending ?? 0 });
      setSystemOk(!e1 && !e2 && !e3);
      setRecentDocs((recent as SopDocument[]) ?? []);
    }
    load();
  }, [location.pathname]);

  // Cmd/Ctrl+K opens the command palette, Cmd/Ctrl+B toggles the sidebar -
  // both ignored while typing in an input/textarea/select.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !typing) {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem(RECENTS_KEY, recentsOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [recentsOpen]);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const railWidth = collapsed ? 'w-[76px]' : 'w-[280px]';

  return (
    <div className="min-h-screen flex bg-ink text-slate-200">
      <aside
        className={`${railWidth} bg-ink-secondary border-r border-white/[0.06] flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden`}
      >
        {/* Header: logo + collapse toggle */}
        <div className="px-4 py-5 border-b border-white/[0.06] flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <LavaLogo className="w-9 h-9 rounded-lg flex-shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-slate-50 font-semibold text-base leading-tight truncate">LAVA Automation</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="relative flex w-2 h-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
                  </span>
                  <span className="text-xs font-mono text-slate-500 whitespace-nowrap">System Online · v2.4.0</span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Quick actions */}
        <div className={`px-3 pt-4 ${collapsed ? '' : 'space-y-2'}`}>
          <button
            onClick={() => setPaletteOpen(true)}
            title="Quick Search (Ctrl+K)"
            className={`w-full flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:border-white/[0.15] transition-colors text-sm ${
              collapsed ? 'justify-center py-2.5' : 'px-3.5 py-2.5'
            }`}
          >
            <Search className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="flex-1 text-left truncate">Quick Search</span>}
            {!collapsed && <kbd className="text-xs font-mono border border-white/10 rounded px-1.5 py-0.5">⌘K</kbd>}
          </button>
          <button
            onClick={() => navigate('/admin/upload')}
            title="New SOP"
            className={`w-full flex items-center gap-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors text-sm shadow-[0_0_0_1px_rgba(225,29,72,0.4),0_0_12px_-4px_rgba(255,42,95,0.6)] ${
              collapsed ? 'justify-center py-2.5 mt-2' : 'px-3.5 py-2.5'
            }`}
          >
            <Plus className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>New SOP</span>}
          </button>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const count = item.countKey ? counts[item.countKey] : null;
            const isAlert = item.alert && !!count;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? `${item.label}${count ? ` (${count})` : ''}` : undefined}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all ${
                    collapsed ? 'justify-center py-3' : 'pl-3.5 pr-3 py-3'
                  } ${
                    isActive
                      ? 'bg-brand-600/15 text-slate-50'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && !collapsed && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-500" />}
                    <span className="relative flex-shrink-0">
                      <item.icon className={`w-5 h-5 ${isActive ? 'text-brand-400' : ''}`} />
                      {collapsed && isAlert && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-ink-secondary" />
                      )}
                    </span>
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && count !== null && (
                      isAlert ? (
                        <span className="text-xs font-semibold text-white bg-red-500 rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center tabular-nums">
                          {count}
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-slate-500 tabular-nums">{count}</span>
                      )
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
            title={collapsed ? 'VA Portal' : undefined}
            className={`flex items-center gap-3 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] transition-all ${
              collapsed ? 'justify-center py-3' : 'pl-3.5 pr-3 py-3'
            }`}
          >
            <ExternalLink className="w-5 h-5 flex-shrink-0" />
            {!collapsed && 'VA Portal'}
          </a>
        </nav>

        {/* Recents: most recently added/updated SOPs - hidden in collapsed rail (no room for titles) */}
        {!collapsed && (
          <div className="px-3 pb-3 border-t border-white/[0.06] pt-4">
            <button
              onClick={() => setRecentsOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-1 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${recentsOpen ? '' : '-rotate-90'}`} />
              <Clock className="w-3.5 h-3.5" />
              Recents
            </button>
            {recentsOpen && (
              recentDocs.length === 0 ? (
                <p className="px-2 py-2 text-sm text-slate-600">No SOPs yet</p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {recentDocs.map((doc) => (
                    <NavLink
                      key={doc.id}
                      to={`/admin/review/${doc.id}`}
                      className="group flex items-center gap-2 pl-3.5 pr-2.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="truncate flex-1">{doc.title}</span>
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </NavLink>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Profile footer */}
        <div className="relative px-3 py-4 border-t border-white/[0.06]">
          {accountMenuOpen && (
            <div className="fixed inset-0 z-0" onClick={() => setAccountMenuOpen(false)} />
          )}
          {accountMenuOpen && (
            <div
              className={`absolute bottom-full mb-2 bg-[#161c2b] border border-white/10 rounded-lg shadow-2xl py-2 z-10 ${
                collapsed ? 'left-2 w-52' : 'left-3 right-3'
              }`}
            >
              <button
                disabled
                title="Coming soon"
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-slate-500 cursor-not-allowed"
              >
                <User className="w-4 h-4" />
                Profile Settings
              </button>
              <div className="h-px bg-white/[0.06] my-1" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}

          <div className={`relative z-10 flex items-center gap-3 px-1 py-1 ${collapsed ? 'justify-center' : ''}`}>
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 bg-white/[0.06] rounded-full flex items-center justify-center text-sm font-medium text-slate-200">
                {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'A'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-ink-secondary" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-slate-100 text-sm font-medium truncate">{profile?.full_name || 'Admin'}</p>
                <p className="text-slate-500 text-xs truncate">Admin</p>
              </div>
            )}
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              title="Account settings"
              aria-label="Account settings"
              className={`flex-shrink-0 text-slate-500 hover:text-slate-200 transition-colors ${accountMenuOpen ? 'text-slate-200' : ''}`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-20 flex-shrink-0 border-b border-white/[0.06] bg-ink-secondary/60 backdrop-blur-sm flex items-center px-6 gap-5">
          <div className="flex items-center gap-2 text-sm text-slate-500 flex-shrink-0">
            <span>Admin</span>
            <span className="text-slate-700">/</span>
            <span className="text-slate-200 font-medium">{breadcrumbFor(location.pathname)}</span>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex-1 max-w-md h-11 flex items-center gap-2.5 px-4 rounded-lg border border-white/[0.08] bg-white/[0.02] text-slate-500 text-sm hover:border-white/[0.15] hover:text-slate-400 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left truncate">Search SOPs, carriers...</span>
            <kbd className="text-xs font-mono border border-white/10 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>

          <div className="flex-1" />

          <div className="hidden lg:flex items-center gap-2 text-sm font-mono text-slate-500 flex-shrink-0">
            <span className={`w-2 h-2 rounded-full ${systemOk === false ? 'bg-red-400' : 'bg-emerald-400'}`} />
            {systemOk === false ? 'Degraded' : 'Operational'}
          </div>

          <button
            onClick={() => navigate('/admin/upload')}
            className="flex-shrink-0 h-11 flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 rounded-lg transition-colors shadow-[0_0_0_1px_rgba(225,29,72,0.4),0_0_16px_-4px_rgba(255,42,95,0.6)]"
          >
            <Upload className="w-4 h-4" />
            Upload SOP
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
