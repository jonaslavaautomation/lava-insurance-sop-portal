import { useEffect, useMemo, useState } from 'react';
import { Building2, FileText, TrendingUp, FileCheck, Activity, Radio } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase, type EngagementDailyPoint } from '@/lib/supabase';
import { KPICard, type TrendDirection } from '@/components/admin/KPICard';
import { TelemetryPanel, type TelemetryEvent } from '@/components/admin/TelemetryPanel';
import { LoadingState } from '@/components/admin/DataStates';

type RangeDays = 7 | 30 | 90;

interface Stats {
  companies: number;
  companiesThisMonth: number;
  documents: number;
  documentsThisMonth: number;
  published: number;
  pending: number;
}

function trendFor(current: number, previous: number): { direction: TrendDirection; label: string } {
  const diff = current - previous;
  if (diff === 0) return { direction: 'neutral', label: 'No change' };
  const direction: TrendDirection = diff > 0 ? 'up' : 'down';
  return { direction, label: `${diff > 0 ? '+' : ''}${diff} vs prior period` };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ companies: 0, companiesThisMonth: 0, documents: 0, documentsThisMonth: 0, published: 0, pending: 0 });
  const [totalViews, setTotalViews] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [daily, setDaily] = useState<EngagementDailyPoint[]>([]);
  const [range, setRange] = useState<RangeDays>(30);
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [
        { count: companies }, { count: companiesThisMonth },
        { count: documents }, { count: documentsThisMonth },
        { count: published }, { count: pending },
        { data: engagement },
        { data: dailyPoints },
      ] = await Promise.all([
        supabase.from('insurance_companies').select('*', { count: 'exact', head: true }),
        supabase.from('insurance_companies').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('sop_documents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.rpc('get_sop_engagement', { p_sop_ids: null, p_since: null }),
        supabase.rpc('get_engagement_daily', { p_days: 90 }),
      ]);

      setStats({
        companies: companies ?? 0,
        companiesThisMonth: companiesThisMonth ?? 0,
        documents: documents ?? 0,
        documentsThisMonth: documentsThisMonth ?? 0,
        published: published ?? 0,
        pending: pending ?? 0,
      });

      const views = (engagement ?? []).reduce((sum: number, e: { view_count: number }) => sum + e.view_count, 0);
      const likes = (engagement ?? []).reduce((sum: number, e: { like_count: number }) => sum + e.like_count, 0);
      setTotalViews(views);
      setTotalLikes(likes);
      setDaily((dailyPoints as EngagementDailyPoint[]) ?? []);

      // Recent activity, merged from the real log tables and anonymized
      // (no user identity shown) - not a fabricated feed.
      const [viewsRes, likesRes, publishedRes, uploadsRes] = await Promise.all([
        supabase.from('sop_views').select('id, created_at, sop_documents(title)').order('created_at', { ascending: false }).limit(5),
        supabase.from('sop_likes').select('id, created_at, sop_documents(title)').order('created_at', { ascending: false }).limit(5),
        supabase.from('sop_versions').select('id, created_at, status, sop_documents(title)').eq('status', 'published').order('created_at', { ascending: false }).limit(5),
        supabase.from('sop_documents').select('id, created_at, title').order('created_at', { ascending: false }).limit(5),
      ]);

      type Embedded = { id: string; created_at: string; sop_documents: { title: string } | { title: string }[] | null };
      const titleOf = (row: Embedded) => {
        const sd = row.sop_documents;
        if (!sd) return 'Untitled SOP';
        return Array.isArray(sd) ? sd[0]?.title ?? 'Untitled SOP' : sd.title;
      };

      const events: TelemetryEvent[] = [
        ...((viewsRes.data as Embedded[]) ?? []).map((r, i) => ({ id: `v-${i}-${r.id}`, timestamp: r.created_at, action: 'VA viewed', subject: titleOf(r), tone: 'view' as const })),
        ...((likesRes.data as Embedded[]) ?? []).map((r, i) => ({ id: `l-${i}-${r.id}`, timestamp: r.created_at, action: 'VA liked', subject: titleOf(r), tone: 'like' as const })),
        ...((publishedRes.data as Embedded[]) ?? []).map((r, i) => ({ id: `p-${i}-${r.id}`, timestamp: r.created_at, action: 'SOP published', subject: titleOf(r), tone: 'publish' as const })),
        ...(uploadsRes.data ?? []).map((r, i) => ({ id: `u-${i}-${r.id}`, timestamp: r.created_at, action: 'SOP uploaded', subject: r.title, tone: 'upload' as const })),
      ]
        .filter((e) => !!e.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 8);

      setTelemetry(events);
      setLoading(false);
    }
    load();
  }, []);

  const visibleDaily = useMemo(() => daily.slice(-range), [daily, range]);

  const { totalViewsInRange, totalLikesInRange, viewTrend } = useMemo(() => {
    const half = Math.floor(visibleDaily.length / 2) || 1;
    const recent = visibleDaily.slice(-half);
    const prior = visibleDaily.slice(0, visibleDaily.length - half);
    const sum = (rows: EngagementDailyPoint[], key: 'view_count' | 'like_count') => rows.reduce((s, r) => s + r[key], 0);
    return {
      totalViewsInRange: sum(visibleDaily, 'view_count'),
      totalLikesInRange: sum(visibleDaily, 'like_count'),
      viewTrend: trendFor(sum(recent, 'view_count'), sum(prior, 'view_count')),
    };
  }, [visibleDaily]);

  const engagementSpark = useMemo(() => daily.slice(-14).map((d) => d.view_count + d.like_count), [daily]);

  if (loading) return <div className="p-6"><LoadingState label="Loading dashboard..." /></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">Dashboard</h1>
          <p className="text-slate-500 text-xs mt-0.5">Overview of your SOP knowledge base</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KPICard
          label="Insurance Companies"
          value={stats.companies}
          icon={Building2}
          accent="cyan"
          trend={{ direction: stats.companiesThisMonth > 0 ? 'up' : 'neutral', label: `+${stats.companiesThisMonth} this month` }}
        />
        <KPICard
          label="Total SOP Documents"
          value={stats.documents}
          icon={FileText}
          accent="sky"
          trend={{ direction: stats.documentsThisMonth > 0 ? 'up' : 'neutral', label: `+${stats.documentsThisMonth} this month` }}
        />
        <KPICard
          label="Published SOPs"
          value={stats.published}
          icon={TrendingUp}
          accent="emerald"
          trend={{ direction: 'neutral', label: stats.documents > 0 ? `${Math.round((stats.published / stats.documents) * 100)}% of library` : 'No SOPs yet' }}
        />
        <KPICard
          label="Pending Reviews"
          value={stats.pending}
          icon={FileCheck}
          accent="amber"
          trend={{ direction: stats.pending > 0 ? 'down' : 'neutral', label: stats.pending > 0 ? 'Needs attention' : 'Up to date' }}
        />
        <KPICard
          label="Total Engagement"
          value={totalViews + totalLikes}
          icon={Activity}
          accent="brand"
          trend={{ direction: 'neutral', label: `${totalViews} views · ${totalLikes} likes` }}
          sparkline={engagementSpark.length > 1 ? engagementSpark : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[65%_35%] gap-4">
        <div className="bg-[#121723]/80 border border-white/[0.08] rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[13px] font-semibold text-slate-200">SOP Engagement</h2>
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-md p-0.5">
              {([7, 30, 90] as RangeDays[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`text-[11px] font-mono px-2 py-1 rounded ${
                    range === r ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {r}D
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-5 mb-3 text-[11px]">
            <span className="text-slate-500">Total Views <span className="font-mono text-slate-200">{totalViewsInRange}</span></span>
            <span className="text-slate-500">Total Likes <span className="font-mono text-slate-200">{totalLikesInRange}</span></span>
            <span className={`font-mono ${viewTrend.direction === 'up' ? 'text-emerald-400' : viewTrend.direction === 'down' ? 'text-red-400' : 'text-slate-500'}`}>
              {viewTrend.label}
            </span>
          </div>

          {visibleDaily.every((d) => d.view_count === 0 && d.like_count === 0) ? (
            <p className="text-xs text-slate-600 text-center py-16">No engagement data available yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visibleDaily} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="likesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF2A5F" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#FF2A5F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                    minTickGap={30}
                  />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'ui-monospace, monospace' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: '#0D111B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#94A3B8', fontFamily: 'ui-monospace, monospace', marginBottom: 4 }}
                    itemStyle={{ fontFamily: 'ui-monospace, monospace' }}
                    labelFormatter={(d) => (typeof d === 'string' ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : d)}
                  />
                  <Area type="monotone" dataKey="view_count" name="Views" stroke="#38BDF8" strokeWidth={1.5} fill="url(#viewsFill)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="like_count" name="Likes" stroke="#FF2A5F" strokeWidth={1.5} fill="url(#likesFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-[#121723]/80 border border-white/[0.08] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <h2 className="text-[13px] font-semibold text-slate-200">Live System Telemetry</h2>
          </div>
          <TelemetryPanel events={telemetry} />
        </div>
      </div>
    </div>
  );
}
