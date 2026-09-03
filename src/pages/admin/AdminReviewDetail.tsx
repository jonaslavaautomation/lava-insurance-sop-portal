import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Archive, Loader2, AlertCircle, FileText, History } from 'lucide-react';
import { supabase, type SopDocument, type SopContent, type SopVersion, type InsuranceCompany } from '@/lib/supabase';

export default function AdminReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<SopDocument | null>(null);
  const [content, setContent] = useState<SopContent | null>(null);
  const [company, setCompany] = useState<InsuranceCompany | null>(null);
  const [versions, setVersions] = useState<SopVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data: d } = await supabase.from('sop_documents').select('*').eq('id', id).maybeSingle();
      if (!d) { setLoading(false); return; }
      setDoc(d as SopDocument);

      const { data: c } = await supabase.from('sop_content').select('*').eq('sop_document_id', id).maybeSingle();
      setContent(c as SopContent | null);
      setEditableContent(c?.content ?? '');

      if (d) {
        const { data: comp } = await supabase.from('insurance_companies').select('*').eq('id', d.insurance_company_id).maybeSingle();
        setCompany(comp as InsuranceCompany | null);

        const { data: vers } = await supabase.from('sop_versions').select('*').eq('sop_document_id', id).order('created_at', { ascending: false });
        setVersions(vers ?? []);
      }

      setLoading(false);
    }
    load();
  }, [id]);

  async function updateStatus(status: 'published' | 'archived') {
    if (!id) return;
    setActionLoading(true);
    setError(null);

    // Save edited content
    if (editableContent !== content?.content) {
      await supabase.from('sop_content').update({ content: editableContent }).eq('sop_document_id', id);
    }

    // If publishing, archive any currently-published versions of this doc
    if (status === 'published') {
      await supabase.from('sop_versions').update({ status: 'archived' }).eq('sop_document_id', id).eq('status', 'published');
      await supabase.from('sop_versions').insert({
        sop_document_id: id,
        version: doc?.version ?? '1.0',
        status: 'published',
      });
    }

    const { error: updateError } = await supabase.from('sop_documents').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (updateError) {
      setError(updateError.message);
      setActionLoading(false);
      return;
    }

    setActionLoading(false);
    navigate('/admin/library');
  }

  async function handleDelete() {
    if (!id || !doc) return;
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setActionLoading(true);
    const { error: deleteError } = await supabase.from('sop_documents').delete().eq('id', id);
    if (deleteError) {
      setError(deleteError.message);
      setActionLoading(false);
      return;
    }
    navigate('/admin/library');
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm animate-pulse">Loading...</div>;

  if (!doc) {
    return (
      <div className="p-8">
        <p className="text-slate-500 text-sm">SOP document not found.</p>
        <Link to="/admin/review" className="text-blue-600 text-sm mt-2 inline-block">Back to Pending Reviews</Link>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      published: 'bg-green-50 text-green-700 border-green-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      archived: 'bg-slate-100 text-slate-500 border-slate-200',
    };
    const labels: Record<string, string> = { published: 'Published', pending: 'Pending Review', archived: 'Archived' };
    return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${map[status]}`}>{labels[status]}</span>;
  };

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/admin/library" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Library
      </Link>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">{doc.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>{company?.name ?? '—'}</span>
              <span className="text-slate-300">|</span>
              <span>{doc.line_of_business}</span>
              <span className="text-slate-300">|</span>
              <span>{doc.process_category}</span>
              <span className="text-slate-300">|</span>
              <span>v{doc.version}</span>
              <span className="text-slate-300">|</span>
              {statusBadge(doc.status)}
            </div>
          </div>
        </div>

        {versions.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
            >
              <History className="w-4 h-4" />
              Version History ({versions.length})
            </button>
            {showVersions && (
              <div className="mt-3 space-y-2 pl-6">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-slate-700">v{v.version}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${v.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {v.status}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" /> SOP Content
          </h2>
          <span className="text-xs text-slate-400">Review and edit before publishing</span>
        </div>
        <textarea
          value={editableContent}
          onChange={(e) => setEditableContent(e.target.value)}
          rows={16}
          className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono resize-y"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {doc.status !== 'published' && (
          <button
            onClick={() => updateStatus('published')}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Approve & Publish
          </button>
        )}
        {doc.status === 'published' && (
          <button
            onClick={() => updateStatus('archived')}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Archive SOP
          </button>
        )}
        {doc.status === 'pending' && (
          <button
            onClick={() => updateStatus('archived')}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-amber-100 hover:bg-amber-200 text-amber-700 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" /> Reject
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={actionLoading}
          className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 ml-auto"
        >
          <XCircle className="w-4 h-4" /> Delete
        </button>
      </div>
    </div>
  );
}
