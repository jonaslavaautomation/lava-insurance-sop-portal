import { useEffect, useState } from 'react';
import { Building2, Plus, Trash2, FileText, Loader2 } from 'lucide-react';
import { supabase, type InsuranceCompany } from '@/lib/supabase';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataStates';

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('insurance_companies').select('*').order('name');
    const companyList = data ?? [];
    setCompanies(companyList);

    const counts: Record<string, number> = {};
    for (const c of companyList) {
      const { count } = await supabase
        .from('sop_documents')
        .select('*', { count: 'exact', head: true })
        .eq('insurance_company_id', c.id);
      counts[c.id] = count ?? 0;
    }
    setDocCounts(counts);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from('insurance_companies').insert({ name: newName.trim() });
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    setNewName('');
    setShowAdd(false);
    setSubmitting(false);
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will also delete all SOP documents for this company.`)) return;
    const { error } = await supabase.from('insurance_companies').delete().eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-slate-50 mb-0.5">Insurance Companies</h1>
          <p className="text-slate-500 text-xs">Manage insurance companies in the knowledge base</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-[13px] font-medium px-3.5 py-2 rounded-md transition-colors shadow-[0_0_0_1px_rgba(225,29,72,0.4),0_0_16px_-4px_rgba(255,42,95,0.6)]"
        >
          <Plus className="w-4 h-4" />
          Add Company
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-5 bg-[#121723]/80 rounded-lg border border-white/[0.08] p-4">
          <label className="block text-xs font-medium text-slate-300 mb-2">Company Name</label>
          <div className="flex gap-2.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Travelers"
              autoFocus
              className="flex-1 px-3.5 py-2.5 rounded-md border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100"
            />
            <button type="submit" disabled={submitting} className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2.5 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-sm text-slate-500 hover:text-slate-300 px-3 py-2.5">
              Cancel
            </button>
          </div>
          {error && <div className="mt-3"><ErrorState message={error} /></div>}
        </form>
      )}

      {error && !showAdd && <div className="mb-4"><ErrorState message={error} /></div>}

      {loading ? (
        <LoadingState label="Loading companies..." />
      ) : companies.length === 0 ? (
        <EmptyState icon={Building2} title="No insurance companies yet" description={'Click "Add Company" to get started.'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map((company) => (
            <div key={company.id} className="bg-[#121723]/80 rounded-lg border border-white/[0.08] p-4 hover:border-white/[0.15] transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-500/10 rounded-md flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-brand-400" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-slate-100">{company.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{new Date(company.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(company.id, company.name)}
                  className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Delete ${company.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <FileText className="w-3.5 h-3.5" />
                {docCounts[company.id] ?? 0} SOP document{(docCounts[company.id] ?? 0) !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
