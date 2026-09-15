import { useEffect, useState } from 'react';
import { Server, Plus, Trash2, FileText, Loader2 } from 'lucide-react';
import { supabase, type InsuranceCompany } from '@/lib/supabase';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataStates';
import { CarrierLogo } from '@/components/CarrierLogo';

/**
 * Manages Agency Management Systems (AMS) - agency software like a
 * quoting/policy system, not an insurance carrier. Deliberately its own
 * page/route/nav item (mirrors AdminCompanies) so it reads as a clearly
 * separate section for admins, matching the separate "AMS" folder VAs see
 * in the portal. Under the hood it's the same `insurance_companies` table,
 * just rows where type = 'ams' - see the AMS migration for why.
 */
export default function AdminAMS() {
  const [systems, setSystems] = useState<InsuranceCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase.from('insurance_companies').select('*').eq('type', 'ams').order('name');
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const list = data ?? [];
    setSystems(list);

    const counts: Record<string, number> = {};
    for (const s of list) {
      const { count } = await supabase
        .from('sop_documents')
        .select('*', { count: 'exact', head: true })
        .eq('insurance_company_id', s.id);
      counts[s.id] = count ?? 0;
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
    const { error } = await supabase.from('insurance_companies').insert({ name: newName.trim(), type: 'ams' });
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
    if (!confirm(`Delete "${name}"? This will also delete all SOP documents for this AMS.`)) return;
    const { error } = await supabase.from('insurance_companies').delete().eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-50 mb-1">Agency Management Systems</h1>
          <p className="text-slate-500 text-base">Manage AMS platforms in the knowledge base - separate from insurance carriers</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 h-11 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 rounded-lg transition-colors shadow-[0_0_0_1px_rgba(225,29,72,0.4),0_0_16px_-4px_rgba(255,42,95,0.6)]"
        >
          <Plus className="w-4 h-4" />
          Add AMS
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 bg-[#121723]/80 rounded-xl border border-white/[0.08] p-6">
          <label className="block text-sm font-medium text-slate-300 mb-2.5">AMS Name</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Applied Epic"
              autoFocus
              className="flex-1 h-11 px-4 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100"
            />
            <button type="submit" disabled={submitting} className="h-11 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="h-11 text-sm text-slate-500 hover:text-slate-300 px-4">
              Cancel
            </button>
          </div>
          {error && <div className="mt-4"><ErrorState message={error} /></div>}
        </form>
      )}

      {error && !showAdd && <div className="mb-6"><ErrorState message={error} /></div>}

      {loading ? (
        <LoadingState label="Loading AMS platforms..." />
      ) : error ? null : systems.length === 0 ? (
        <EmptyState icon={Server} title="No AMS platforms yet" description={'Click "Add AMS" to get started.'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {systems.map((system) => (
            <div key={system.id} className="bg-[#121723]/80 rounded-xl border border-white/[0.08] p-6 hover:border-white/[0.15] transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <CarrierLogo name={system.name} size={44} />
                  <div>
                    <p className="text-base font-medium text-slate-100">{system.name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{new Date(system.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(system.id, system.name)}
                  className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Delete ${system.name}`}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <FileText className="w-4 h-4" />
                {docCounts[system.id] ?? 0} SOP document{(docCounts[system.id] ?? 0) !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
