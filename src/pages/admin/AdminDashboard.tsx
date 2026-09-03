import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileText, FileCheck, Archive, TrendingUp, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Stats {
  companies: number;
  documents: number;
  published: number;
  pending: number;
  archived: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ companies: 0, documents: 0, published: 0, pending: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [recentDocs, setRecentDocs] = useState<{ id: string; title: string; status: string; created_at: string }[]>([]);

  useEffect(() => {
    async function load() {
      const { count: companies } = await supabase.from('insurance_companies').select('*', { count: 'exact', head: true });
      const { count: documents } = await supabase.from('sop_documents').select('*', { count: 'exact', head: true });
      const { count: published } = await supabase.from('sop_documents').select('*', { count: 'exact', head: true }).eq('status', 'published');
      const { count: pending } = await supabase.from('sop_documents').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: archived } = await supabase.from('sop_documents').select('*', { count: 'exact', head: true }).eq('status', 'archived');

      const { data: recent } = await supabase
        .from('sop_documents')
        .select('id, title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        companies: companies ?? 0,
        documents: documents ?? 0,
        published: published ?? 0,
        pending: pending ?? 0,
        archived: archived ?? 0,
      });
      setRecentDocs(recent ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: 'Insurance Companies', value: stats.companies, icon: Building2, color: 'blue' },
    { label: 'Total SOP Documents', value: stats.documents, icon: FileText, color: 'slate' },
    { label: 'Published SOPs', value: stats.published, icon: TrendingUp, color: 'green' },
    { label: 'Pending Reviews', value: stats.pending, icon: FileCheck, color: 'amber' },
    { label: 'Archived SOPs', value: stats.archived, icon: Archive, color: 'slate' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
    green: 'bg-green-50 text-green-600 border-green-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  if (loading) {
    return <div className="p-8 text-slate-400 text-sm animate-pulse">Loading dashboard...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Dashboard</h1>
      <p className="text-slate-500 text-sm mb-8">Overview of your SOP knowledge base</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Recent Uploads</h2>
            <Link to="/admin/library" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {recentDocs.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No SOP documents uploaded yet</p>
          ) : (
            <div className="space-y-3">
              {recentDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{doc.title}</p>
                    <p className="text-xs text-slate-400">{new Date(doc.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    doc.status === 'published' ? 'bg-green-50 text-green-700' :
                    doc.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {doc.status === 'published' ? 'Published' : doc.status === 'pending' ? 'Pending' : 'Archived'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link to="/admin/upload" className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Upload New SOP</p>
                  <p className="text-xs text-slate-400">Add a new SOP document</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
            </Link>
            <Link to="/admin/companies" className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Add Insurance Company</p>
                  <p className="text-xs text-slate-400">Create a new company entry</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
            </Link>
            <Link to="/admin/review" className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                  <FileCheck className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Review Pending SOPs</p>
                  <p className="text-xs text-slate-400">{stats.pending} awaiting approval</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
