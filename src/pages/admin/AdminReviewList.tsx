import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Clock, Eye, ArrowRight } from 'lucide-react';
import { supabase, type SopDocument, type InsuranceCompany } from '@/lib/supabase';
import { EmptyState, LoadingState } from '@/components/admin/DataStates';

export default function AdminReviewList() {
  const [documents, setDocuments] = useState<SopDocument[]>([]);
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: docs } = await supabase
        .from('sop_documents')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      const { data: comps } = await supabase.from('insurance_companies').select('*').order('name');
      setDocuments(docs ?? []);
      setCompanies(comps ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const companyMap: Record<string, string> = {};
  companies.forEach((c) => { companyMap[c.id] = c.name; });

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-slate-50 mb-0.5">Pending Reviews</h1>
      <p className="text-slate-500 text-xs mb-5">SOP documents awaiting your review and approval</p>

      {loading ? (
        <LoadingState label="Loading pending reviews..." />
      ) : documents.length === 0 ? (
        <EmptyState icon={FileCheck} title="No pending reviews" description="All SOPs are up to date." />
      ) : (
        <div className="space-y-2.5">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-[#121723]/80 rounded-lg border border-white/[0.08] p-4 hover:border-white/[0.15] transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-9 h-9 bg-amber-500/10 rounded-md flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-slate-100 truncate">{doc.title}</p>
                    <div className="flex items-center gap-2.5 mt-1">
                      <span className="text-[11px] text-slate-500">{companyMap[doc.insurance_company_id] ?? '—'}</span>
                      <span className="text-[11px] text-slate-700">|</span>
                      <span className="text-[11px] text-slate-500">{doc.process_category}</span>
                      <span className="text-[11px] text-slate-700">|</span>
                      <span className="text-[11px] font-mono text-slate-500">v{doc.version}</span>
                    </div>
                  </div>
                </div>
                <Link
                  to={`/admin/review/${doc.id}`}
                  className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium px-3 py-1.5 rounded-md hover:bg-brand-500/10 transition-colors flex-shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" /> Review <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
