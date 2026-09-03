import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Clock, Eye, ArrowRight } from 'lucide-react';
import { supabase, type SopDocument, type InsuranceCompany } from '@/lib/supabase';

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
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Pending Reviews</h1>
      <p className="text-slate-500 text-sm mb-6">SOP documents awaiting your review and approval</p>

      {loading ? (
        <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 rounded-2xl mb-4">
            <FileCheck className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-slate-500 text-sm">No pending reviews. All SOPs are up to date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{doc.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-500">{companyMap[doc.insurance_company_id] ?? '—'}</span>
                      <span className="text-xs text-slate-300">|</span>
                      <span className="text-xs text-slate-500">{doc.process_category}</span>
                      <span className="text-xs text-slate-300">|</span>
                      <span className="text-xs text-slate-500">v{doc.version}</span>
                    </div>
                  </div>
                </div>
                <Link
                  to={`/admin/review/${doc.id}`}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Eye className="w-4 h-4" /> Review <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
