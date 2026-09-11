import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, FileText, Eye, ThumbsUp, Archive, CheckCircle, Clock } from 'lucide-react';
import { supabase, type SopDocument, type InsuranceCompany, type SopEngagement } from '@/lib/supabase';
import { EmptyState, LoadingState } from '@/components/admin/DataStates';

export default function AdminLibrary() {
  const [documents, setDocuments] = useState<SopDocument[]>([]);
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [engagement, setEngagement] = useState<Record<string, SopEngagement>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeCategory, setActiveCategory] = useState('ALL');

  useEffect(() => {
    async function load() {
      const [{ data: docs }, { data: comps }, { data: eng }] = await Promise.all([
        supabase.from('sop_documents').select('*').order('created_at', { ascending: false }),
        supabase.from('insurance_companies').select('*').order('name'),
        supabase.rpc('get_sop_engagement', { p_sop_ids: null, p_since: null }),
      ]);
      setDocuments(docs ?? []);
      setCompanies(comps ?? []);
      const map: Record<string, SopEngagement> = {};
      ((eng as SopEngagement[]) ?? []).forEach((e) => { map[e.sop_document_id] = e; });
      setEngagement(map);
      setLoading(false);
    }
    load();
  }, []);

  // Real distinct categories from the current library - never a hardcoded
  // insurance-specific chip list that might not match what's actually here.
  const categories = useMemo(() => {
    const set = new Set(documents.map((d) => d.process_category));
    return Array.from(set).sort();
  }, [documents]);

  const companyMap = useMemo(() => {
    const map: Record<string, string> = {};
    companies.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [companies]);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      if (filterCompany !== 'all' && doc.insurance_company_id !== filterCompany) return false;
      if (filterStatus !== 'all' && doc.status !== filterStatus) return false;
      if (activeCategory !== 'ALL' && doc.process_category !== activeCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!doc.title.toLowerCase().includes(q) && !doc.process_category.toLowerCase().includes(q) && !doc.line_of_business.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [documents, filterCompany, filterStatus, activeCategory, search]);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; icon: typeof CheckCircle; class: string }> = {
      published: { label: 'Published', icon: CheckCircle, class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      pending: { label: 'Pending', icon: Clock, class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      archived: { label: 'Archived', icon: Archive, class: 'bg-white/[0.04] text-slate-500 border-white/10' },
    };
    const s = map[status] ?? map.pending;
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.class}`}>
        <s.icon className="w-3 h-3" />
        {s.label}
      </span>
    );
  };

  const timeAgo = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${Math.max(mins, 0)}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-slate-50 mb-0.5">SOP Library</h1>
      <p className="text-slate-500 text-xs mb-4">Browse, search, and manage all SOP documents</p>

      <div className="bg-[#121723]/80 border border-white/[0.08] rounded-lg p-3.5 mb-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOPs..."
              className="w-full pl-8 pr-3 py-2 rounded-md border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-[13px] text-slate-100 placeholder:text-slate-600"
            />
          </div>
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 text-[13px] text-slate-200">
            <option value="all" className="bg-ink-secondary">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id} className="bg-ink-secondary">{c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 text-[13px] text-slate-200">
            <option value="all" className="bg-ink-secondary">All Statuses</option>
            <option value="published" className="bg-ink-secondary">Published</option>
            <option value="pending" className="bg-ink-secondary">Pending Review</option>
            <option value="archived" className="bg-ink-secondary">Archived</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['ALL', ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-[11px] font-medium uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                activeCategory === cat
                  ? 'bg-brand-600/20 border-brand-500/40 text-brand-400'
                  : 'border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#121723]/80 border border-white/[0.08] rounded-lg overflow-hidden">
        {loading ? (
          <LoadingState label="Loading SOP library..." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No SOPs found" description="Try adjusting your filters, or upload a new SOP." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-white/[0.02] border-b border-white/[0.08]">
                <tr>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">SOP Title</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 hidden lg:table-cell">Carrier</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 hidden md:table-cell">Category</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 hidden md:table-cell">Version</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Status</th>
                  <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Views</th>
                  <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Likes</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 hidden sm:table-cell">Updated</th>
                  <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((doc) => {
                  const e = engagement[doc.id];
                  return (
                    <tr key={doc.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-100 truncate max-w-[220px]">{doc.title}</p>
                        <p className="text-[11px] text-slate-500">{doc.line_of_business}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 hidden lg:table-cell">{companyMap[doc.insurance_company_id] ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400 hidden md:table-cell">{doc.process_category}</td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono hidden md:table-cell">v{doc.version}</td>
                      <td className="px-4 py-2.5">{statusBadge(doc.status)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                        <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3 text-slate-600" />{e?.view_count ?? 0}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                        <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3 h-3 text-slate-600" />{e?.like_count ?? 0}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px] hidden sm:table-cell">{timeAgo(doc.updated_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link to={`/admin/review/${doc.id}`} className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 font-medium">
                          <Eye className="w-3.5 h-3.5" /> Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
