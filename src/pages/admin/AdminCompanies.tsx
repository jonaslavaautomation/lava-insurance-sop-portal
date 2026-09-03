import { useEffect, useState } from 'react';
import { Building2, Plus, Trash2, FileText, Loader2, AlertCircle } from 'lucide-react';
import { supabase, type InsuranceCompany } from '@/lib/supabase';

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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Insurance Companies</h1>
          <p className="text-slate-500 text-sm">Manage insurance companies in the knowledge base</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Company
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 bg-white rounded-xl border border-slate-200 p-5">
          <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Travelers"
              autoFocus
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5">
              Cancel
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 mt-3">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </form>
      )}

      {error && !showAdd && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
            <Building2 className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">No insurance companies yet. Click "Add Company" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <div key={company.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{company.name}</p>
                    <p className="text-xs text-slate-400">{new Date(company.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(company.id, company.name)}
                  className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
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
