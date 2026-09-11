import { useEffect, useMemo, useState } from 'react';
import { Eye, ThumbsUp, FileText, Calendar, CheckCircle, Clock, Archive } from 'lucide-react';
import { supabase, type SopEngagement } from '@/lib/supabase';

type DateRange = 'today' | '7d' | '30d' | 'month' | 'all';

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

// Converts the selected range into a `since` timestamp for get_sop_engagement.
// "All Time" passes null, i.e. no lower bound - every historical record.
function rangeToSince(range: DateRange): string | null {
  const now = new Date();
  switch (range) {
    case 'today': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return d.toISOString();
    }
    case 'all':
    default:
      return null;
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

const TOP_N = 10;

export default function AdminAnalytics() {
  const [range, setRange] = useState<DateRange>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [totalSops, setTotalSops] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAllViewed, setShowAllViewed] = useState(false);
  const [showAllLiked, setShowAllLiked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      const [{ data: docs }, { data: companies }] = await Promise.all([
        supabase.from('sop_documents').select('id, title, process_category, line_of_business, insurance_company_id, status'),
        supabase.from('insurance_companies').select('id, name'),
      ]);

      const since = rangeToSince(range);
      const { data: engagementData, error } = await supabase.rpc('get_sop_engagement', {
        p_sop_ids: null,
        p_since: since,
      });
      if (error) console.error('Engagement fetch error:', error);

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

      setRows(merged);
      setTotalSops((docs ?? []).length);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [range]);

  const totalViews = useMemo(() => rows.reduce((sum, r) => sum + r.view_count, 0), [rows]);
  const totalLikes = useMemo(() => rows.reduce((sum, r) => sum + r.like_count, 0), [rows]);

  const mostViewed = useMemo(() => [...rows].sort((a, b) => b.view_count - a.view_count), [rows]);
  const mostLiked = useMemo(() => [...rows].sort((a, b) => b.like_count - a.like_count), [rows]);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; icon: typeof CheckCircle; class: string }> = {
      published: { label: 'Published', icon: CheckCircle, class: 'bg-green-50 text-green-700 border-green-200' },
      pending: { label: 'Pending Review', icon: Clock, class: 'bg-amber-50 text-amber-700 border-amber-200' },
      archived: { label: 'Archived', icon: Archive, class: 'bg-slate-100 text-slate-500 border-slate-200' },
    };
    const s = map[status] ?? map.pending;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${s.class}`}>
        <s.icon className="w-3 h-3" />
        {s.label}
      </span>
    );
  };

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

  const cards = [
    { label: 'Total SOPs', value: totalSops, icon: FileText, color: 'brand' },
    { label: 'Total Views', value: totalViews, icon: Eye, color: 'green' },
    { label: 'Total Likes', value: totalLikes, icon: ThumbsUp, color: 'amber' },
  ];

  const colorMap: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  function EngagementTable({
    title,
    data,
    showAll,
    onToggleShowAll,
    primaryLabel,
    primaryKey,
    secondaryLabel,
    secondaryKey,
    lastLabel,
    lastKey,
  }: {
    title: string;
    data: Row[];
    showAll: boolean;
    onToggleShowAll: () => void;
    primaryLabel: string;
    primaryKey: 'view_count' | 'like_count';
    secondaryLabel: string;
    secondaryKey: 'view_count' | 'like_count';
    lastLabel: string;
    lastKey: 'last_viewed_at' | 'last_liked_at';
  }) {
    const visible = showAll ? data : data.slice(0, TOP_N);
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {data.length > TOP_N && (
            <button
              onClick={onToggleShowAll}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              {showAll ? 'Show top 10' : `Show all ${data.length}`}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">Rank</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">SOP / Process Name</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Insurance Company</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Category</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">{primaryLabel}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">{secondaryLabel}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden lg:table-cell">{lastLabel}</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400">No engagement data yet</td>
                </tr>
              ) : (
                visible.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-slate-500">{idx + 1}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-slate-900">{row.title}</p>
                      <p className="text-xs text-slate-400">{row.line_of_business}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">{row.company_name}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">{row.process_category}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-900">{row[primaryKey]}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 hidden sm:table-cell">{row[secondaryKey]}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 hidden lg:table-cell">{formatDate(row[lastKey])}</td>
                    <td className="px-5 py-3.5">{statusBadge(row.status)}</td>
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
    return <div className="p-8 text-slate-400 text-sm animate-pulse">Loading analytics...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">SOP Analytics</h1>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as DateRange)}
            className="px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm bg-white"
          >
            {RANGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>
      <p className="text-slate-500 text-sm mb-8">SOP engagement: views and likes across the knowledge base</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border mb-3 ${colorMap[card.color]}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <EngagementTable
          title="Most Viewed SOPs"
          data={mostViewed}
          showAll={showAllViewed}
          onToggleShowAll={() => setShowAllViewed((v) => !v)}
          primaryLabel="Views"
          primaryKey="view_count"
          secondaryLabel="Likes"
          secondaryKey="like_count"
          lastLabel="Last Viewed"
          lastKey="last_viewed_at"
        />
        <EngagementTable
          title="Most Liked SOPs"
          data={mostLiked}
          showAll={showAllLiked}
          onToggleShowAll={() => setShowAllLiked((v) => !v)}
          primaryLabel="Likes"
          primaryKey="like_count"
          secondaryLabel="Views"
          secondaryKey="view_count"
          lastLabel="Last Liked"
          lastKey="last_liked_at"
        />
      </div>
    </div>
  );
}
