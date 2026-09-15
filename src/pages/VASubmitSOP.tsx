import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut, FileCheck, Clock, Archive, CheckCircle } from 'lucide-react';
import { supabase, type SopDocument, type InsuranceCompany } from '@/lib/supabase';
import { LavaLogo } from '@/components/LavaLogo';
import { SopSubmissionForm } from '@/components/SopSubmissionForm';
import { LoadingState, ErrorState, EmptyState } from '@/components/admin/DataStates';
import { useAuth } from '@/context/AuthContext';

type Tab = 'submit' | 'mine';

// A VA's own submitted-SOP history - only reachable because of the
// sop_docs_select / sop_content_select RLS extension (uploaded_by =
// auth.uid()) added alongside this feature; without it a VA could submit
// but never see what happened to their own submission afterward.
function MySubmissions() {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<SopDocument[]>([]);
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      const [{ data: docsData, error: docsError }, { data: compsData, error: compsError }] = await Promise.all([
        supabase.from('sop_documents').select('*').eq('uploaded_by', profile.id).order('created_at', { ascending: false }),
        supabase.from('insurance_companies').select('*'),
      ]);
      const firstError = docsError ?? compsError;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }
      setDocs(docsData ?? []);
      setCompanies(compsData ?? []);
      setLoading(false);
    }
    load();
  }, [profile]);

  const companyMap: Record<string, string> = {};
  companies.forEach((c) => { companyMap[c.id] = c.name; });

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; icon: typeof CheckCircle; class: string }> = {
      published: { label: 'Published', icon: CheckCircle, class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      pending: { label: 'Pending Review', icon: Clock, class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      archived: { label: 'Not Approved', icon: Archive, class: 'bg-white/[0.04] text-slate-500 border-white/10' },
    };
    const s = map[status] ?? map.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${s.class}`}>
        <s.icon className="w-3.5 h-3.5" />
        {s.label}
      </span>
    );
  };

  if (loading) return <LoadingState label="Loading your submissions..." />;
  if (error) return <ErrorState message={error} />;
  if (docs.length === 0) {
    return <EmptyState icon={FileCheck} title="No submissions yet" description="SOPs you submit will show up here with their review status." />;
  }

  return (
    <div className="space-y-3">
      {docs.map((doc) => (
        <div key={doc.id} className="bg-[#121723]/80 rounded-xl border border-white/[0.08] p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-base font-medium text-slate-100 truncate">{doc.title}</p>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-sm text-slate-500">
                <span>{companyMap[doc.insurance_company_id] ?? '—'}</span>
                <span className="text-slate-700">|</span>
                <span>{doc.process_category}</span>
                <span className="text-slate-700">|</span>
                <span className="font-mono text-xs">{new Date(doc.created_at).toLocaleString()}</span>
              </div>
            </div>
            {statusBadge(doc.status)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VASubmitSOP() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('submit');

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-ink text-slate-200">
      <header className="bg-ink-secondary/80 backdrop-blur-sm border-b border-white/[0.06] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LavaLogo className="w-9 h-9 rounded-lg" />
            <div>
              <h1 className="text-sm font-semibold text-slate-50">Insurance SOP Search Portal</h1>
              <p className="text-[11px] text-slate-500">LAVA Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-slate-300 truncate max-w-[180px]">{profile?.email}</p>
              <p className="text-[10px] text-slate-500">VA / Student Portal</p>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 px-3 py-2 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/portal')}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-300 mb-4 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Portal
        </button>

        <div className="flex gap-2 mb-6 p-1 bg-white/[0.04] rounded-xl w-fit">
          <button
            onClick={() => setTab('submit')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'submit' ? 'bg-white/[0.08] text-slate-50' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Submit New SOP
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'mine' ? 'bg-white/[0.08] text-slate-50' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            My Submissions
          </button>
        </div>

        {tab === 'submit' ? (
          <SopSubmissionForm
            heading="Submit a New SOP"
            description="Write up a process you've learned and share it for approval. Once submitted, an admin will review it before it's published for everyone to see."
            submitLabel="Submit for Review"
            cancelLabel="Back to Portal"
            onCancel={() => navigate('/portal')}
            onSuccess={() => setTab('mine')}
            showSubmitterInfo
            renderNoCompanies={(sourceType) => (
              <p>
                {sourceType === 'ams'
                  ? 'No AMS platforms have been added yet — ask an admin to add one first.'
                  : 'No insurance companies have been added yet — ask an admin to add one first.'}
              </p>
            )}
          />
        ) : (
          <MySubmissions />
        )}
      </main>
    </div>
  );
}
