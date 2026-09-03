import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, FileText, Filter, Eye, Archive, CheckCircle, Clock, XCircle } from 'lucide-react';
import { supabase, type SopDocument, type InsuranceCompany } from '@/lib/supabase';

export default function AdminLibrary() {
  const [documents, setDocuments] = useState<SopDocument[]>([]);
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    async function load() {
      const { data: docs } = await supabase.from('sop_documents').select('*').order('created_at', { ascending: false });
      const { data: comps } = await supabase.from('insurance_companies').select('*').order('name');
      setDocuments(docs ?? []);
      setCompanies(comps ?? []);
      setLoading(false);
    }
    load();
  }, []);

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
      if (filterCategory !== 'all' && doc.process_category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!doc.title.toLowerCase().includes(q) && !doc.process_category.toLowerCase().includes(q) && !doc.line_of_business.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [documents, filterCompany, filterStatus, filterCategory, search]);

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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">SOP Library</h1>
      <p className="text-slate-500 text-sm mb-6">Browse, search, and manage all SOP documents</p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOPs..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white">
            <option value="all">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white">
            <option value="all">All Categories</option>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white">
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="pending">Pending Review</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
            <FileText className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">No SOP documents found. Try adjusting your filters or upload a new SOP.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">Title</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">Company</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Category</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Version</th>
                <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-slate-600 uppercase tracking-wider px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-slate-900">{doc.title}</p>
                    <p className="text-xs text-slate-400">{doc.line_of_business}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">{companyMap[doc.insurance_company_id] ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">{doc.process_category}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-600 hidden md:table-cell">v{doc.version}</td>
                  <td className="px-5 py-3.5">{statusBadge(doc.status)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Link to={`/admin/review/${doc.id}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                      <Eye className="w-4 h-4" /> Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
