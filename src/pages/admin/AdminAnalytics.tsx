import { useEffect, useMemo, useState } from 'react';
import { Eye, ThumbsUp, FileText, Calendar, CheckCircle, Clock, Archive, Search, Users, SearchX } from 'lucide-react';
import { supabase, type SopEngagement } from '@/lib/supabase';
import { KPICard } from '@/components/admin/KPICard';
import { EmptyState } from '@/components/admin/DataStates';

type DateRange = 'today' | '7d' | '30d' | 'month' | 'all';

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

// Converts the selected range into a `since` timestamp. "All Time" passes
// null, i.e. no lower bound - every historical record.
function rangeToSince(range: DateRange): string | null {
  const now = new Date();
  switch (range) {
    case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case '7d': { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
    case '30d': { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString(); }
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    case 'all':
    default: return null;
  }
}

interface Row {
  id: string;
  title: string;
  process_category: string;
  line_of_business: string;
  company_name: string;
  status: string;
  view_count: number;
  like_count: number;
  last_viewed_at: string | null;
  last_liked_at: string | null;
}

interface SearchRow {
  search_query: string;
  result_count: number;
  user_id: string;
  created_at: string;
}

const TOP_N = 10;

export default function AdminAnalytics() {
  const [range, setRange] = useState<DateRange>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [totalSops, setTotalSops] = useState(0);
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [activeVaCount, setActiveVaCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAllViewed, setShowAllViewed] = useState(false);
  const [showAllLiked, setShowAllLiked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = rangeToSince(range);

      const [{ data: docs }, { data: companies }, { data: engagementData, error }] = await Promise.all([
        supabase.from('sop_documents').select('id, title, process_category, line_of_business, insurance_company_id, status'),
        supabase.from('insurance_companies').select('id, name'),
        supabase.rpc('get_sop_engagement', { p_sop_ids: null, p_since: since }),
      ]);
      if (error) console.error('Engagement fetch error:', error);

      let searchQuery = supabase.from('sop_searches').select('search_query, result_count, user_id, created_at').order('created_at', { ascending: false });
      if (since) searchQuery = searchQuery.gte('created_at', since);
      const { data: searchRows, error: searchError } = await searchQuery.limit(1000);
      if (searchError) console.error('Search log fetch error:', searchError);

      let viewsQuery = supabase.from('sop_views').select('user_id');
      if (since) viewsQuery = viewsQuery.gte('created_at', since);
      const { data: viewRows } = await viewsQuery.limit(2000);

      if (cancelled) return;

      const companyMap: Record<string, string> = {};
      (companies ?? []).forEach((c) => { companyMap[c.id] = c.name; });

      const engagementMap: Record<string, SopEngagement> = {};
      ((engagementData as SopEngagement[]) ?? []).forEach((e) => { engagementMap[e.sop_document_id] = e; });

      const merged: Row[] = (docs ?? []).map((d) => {
        const e = engagementMap[d.id];
        return {
          id: d.id,
          title: d.title,
          process_category: d.process_category,
          line_of_business: d.line_of_business,
          company_name: companyMap[d.insurance_company_id] ?? '—',
          status: d.status,
          view_count: e?.view_count ?? 0,
          like_count: e?.like_count ?? 0,
          last_viewed_at: e?.last_viewed_at ?? null,
          last_liked_at: e?.last_liked_at ?? null,
        };
      });

      const activeIds = new Set<string>([
        ...(viewRows ?? []).map((r) => r.user_id),
        ...(searchRows ?? []).map((r) => r.user_id),
      ]);

      setRows(merged);
      setTotalSops((docs ?? []).length);
      setSearches((searchRows as SearchRow[]) ?? []);
      setActiveVaCount(activeIds.size);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range]);

  const totalViews = useMemo(() => rows.reduce((sum, r) => sum + r.view_count, 0), [rows]);
  const totalLikes = useMemo(() => rows.reduce((sum, r) => sum + r.like_count, 0), [rows]);

  const mostViewed = useMemo(() => [...rows].sort((a, b) => b.view_count - a.view_count), [rows]);
  const mostLiked = useMemo(() => [...rows].sort((a, b) => b.like_count - a.like_count), [rows]);

  const topSearchTerms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of searches) {
      const key = s.search_query.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [searches]);

  const zeroResultSearches = useMemo(() => {
    const seen = new Set<string>();
    const list: SearchRow[] = [];
    for (const s of searches) {
      const key = s.search_query.trim().toLowerCase();
      if (s.result_count > 0 || !key || seen.has(key)) continue;
      seen.add(key);
      list.push(s);
      if (list.length >= 8) break;
    }
    return list;
  }, [searches]);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; icon: typeof CheckCircle; class: string }> = {
      published: { label: 'Published', icon: CheckCircle, class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      pending: { label: 'Pending', icon: Clock, class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      archived: { label: 'Archived', icon: Archive, class: 'bg-white/[0.04] text-slate-500 border-white/10' },
    };
    const s = map[status] ?? map.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${s.class}`}>
        <s.icon className="w-3.5 h-3.5" />
        {s.label}
      </span>
    );
  };

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

  function EngagementTable({
    title, data, showAll, onToggleShowAll, primaryLabel, primaryKey, secondaryLabel, secondaryKey, lastLabel, lastKey,
  }: {
    title: string; data: Row[]; showAll: boolean; onToggleShowAll: () => void;
    primaryLabel: string; primaryKey: 'view_count' | 'like_count';
    secondaryLabel: string; secondaryKey: 'view_count' | 'like_count';
    lastLabel: string; lastKey: 'last_viewed_at' | 'last_liked_at';
  }) {
    const visible = showAll ? data : data.slice(0, TOP_N);
    return (
      <div className="bg-[#121723]/80 border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <h2 className="text-xl font-semibold text-slate-200">{title}</h2>
          {data.length > TOP_N && (
            <button onClick={onToggleShowAll} className="text-sm text-brand-400 hover:text-brand-300 font-medium">
              {showAll ? 'Show top 10' : `Show all ${data.length}`}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] border-b border-white/[0.08]">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Rank</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">SOP / Process Name</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 hidden md:table-cell">Carrier</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 hidden md:table-cell">Category</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">{primaryLabel}</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 hidden sm:table-cell">{secondaryLabel}</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 hidden lg:table-cell">{lastLabel}</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {visible.length === 0 ? (
                <tr><td colSpan={8}><EmptyState title="No engagement data available yet." /></td></tr>
              ) : (
                visible.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-4 text-slate-500 font-mono">{idx + 1}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-100 truncate max-w-[240px]">{row.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{row.line_of_business}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-400 hidden md:table-cell">{row.company_name}</td>
                    <td className="px-5 py-4 text-slate-400 hidden md:table-cell">{row.process_category}</td>
                    <td className="px-5 py-4 text-right font-mono font-semibold text-slate-100">{row[primaryKey]}</td>
                    <td className="px-5 py-4 text-right font-mono text-slate-400 hidden sm:table-cell">{row[secondaryKey]}</td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs hidden lg:table-cell">{formatDate(row[lastKey])}</td>
                    <td className="px-5 py-4">{statusBadge(row.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-slate-500 text-sm animate-pulse">Loading analytics...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-slate-50">SOP Analytics</h1>
        <div className="flex items-center gap-2.5">
          <Calendar className="w-4 h-4 text-slate-500" />
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as DateRange)}
            className="h-10 px-3.5 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 text-sm text-slate-200"
          >
            {RANGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} className="bg-ink-secondary">{opt.label}</option>)}
          </select>
        </div>
      </div>
      <p className="text-slate-500 text-base mb-8">SOP engagement: views, likes, and searches across the knowledge base</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <KPICard label="Total SOPs" value={totalSops} icon={FileText} accent="brand" />
        <KPICard label="Total Views" value={totalViews} icon={Eye} accent="sky" />
        <KPICard label="Total Likes" value={totalLikes} icon={ThumbsUp} accent="emerald" />
        <KPICard label="Total Searches" value={searches.length} icon={Search} accent="cyan" />
        <KPICard label="Active VAs" value={activeVaCount} icon={Users} accent="amber" />
      </div>

      <div className="space-y-6">
        <EngagementTable
          title="Most Viewed SOPs" data={mostViewed} showAll={showAllViewed} onToggleShowAll={() => setShowAllViewed((v) => !v)}
          primaryLabel="Views" primaryKey="view_count" secondaryLabel="Likes" secondaryKey="like_count"
          lastLabel="Last Viewed" lastKey="last_viewed_at"
        />
        <EngagementTable
          title="Most Liked SOPs" data={mostLiked} showAll={showAllLiked} onToggleShowAll={() => setShowAllLiked((v) => !v)}
          primaryLabel="Likes" primaryKey="like_count" secondaryLabel="Views" secondaryKey="view_count"
          lastLabel="Last Liked" lastKey="last_liked_at"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#121723]/80 border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <Search className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xl font-semibold text-slate-200">Top Search Terms</h2>
            </div>
            {topSearchTerms.length === 0 ? (
              <EmptyState title="No searches logged yet." />
            ) : (
              <div className="space-y-3">
                {topSearchTerms.map(([term, count], i) => (
                  <div key={term} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300 truncate"><span className="text-slate-600 font-mono mr-2.5">{String(i + 1).padStart(2, '0')}</span>{term}</span>
                    <span className="font-mono text-slate-500 flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#121723]/80 border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <SearchX className="w-4 h-4 text-red-400" />
              <h2 className="text-xl font-semibold text-slate-200">Searches With No Results</h2>
            </div>
            {zeroResultSearches.length === 0 ? (
              <EmptyState title="No zero-result searches - nice." />
            ) : (
              <div className="space-y-3">
                {zeroResultSearches.map((s) => (
                  <div key={`${s.search_query}-${s.created_at}`} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300 truncate">{s.search_query}</span>
                    <span className="font-mono text-xs text-slate-600 flex-shrink-0">{formatDate(s.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
