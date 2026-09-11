import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Archive, Loader2, FileText, History, Eye, ThumbsUp } from 'lucide-react';
import { supabase, type SopDocument, type SopContent, type SopVersion, type InsuranceCompany, type SopEngagement } from '@/lib/supabase';
import { StepsViewer } from '@/components/StepsViewer';
import { DocumentViewer } from '@/components/DocumentViewer';
import { ErrorState } from '@/components/admin/DataStates';

export default function AdminReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<SopDocument | null>(null);
  const [content, setContent] = useState<SopContent | null>(null);
  const [company, setCompany] = useState<InsuranceCompany | null>(null);
  const [versions, setVersions] = useState<SopVersion[]>([]);
  const [engagement, setEngagement] = useState<SopEngagement | null>(null);
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

        const { data: eng } = await supabase.rpc('get_sop_engagement', { p_sop_ids: [id] });
        setEngagement(((eng as SopEngagement[]) ?? [])[0] ?? null);
      }

      setLoading(false);
    }
    load();
  }, [id]);

  async function updateStatus(status: 'published' | 'archived') {
    if (!id) return;
    setActionLoading(true);
    setError(null);

    // Save edited content (steps-based SOPs are read-only here for now —
    // there's no per-step editor yet, so never overwrite their steps json).
    if (content?.content_type !== 'steps' && editableContent !== content?.content) {
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

  if (loading) return <div className="p-8 text-slate-500 text-sm animate-pulse">Loading...</div>;

  if (!doc) {
    return (
      <div className="p-8">
        <p className="text-slate-500 text-base">SOP document not found.</p>
        <Link to="/admin/review" className="text-brand-400 text-sm mt-2 inline-block">Back to Pending Reviews</Link>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      archived: 'bg-white/[0.04] text-slate-500 border-white/10',
    };
    const labels: Record<string, string> = { published: 'Published', pending: 'Pending Review', archived: 'Archived' };
    return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${map[status]}`}>{labels[status]}</span>;
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
        <Link to="/admin/library" className="hover:text-slate-300 transition-colors">SOP Library</Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-500 truncate max-w-[240px]">{company?.name ?? '—'}</span>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300 truncate max-w-[240px]">{doc.process_category}</span>
      </div>

      <Link to="/admin/library" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Library
      </Link>

      {error && <div className="mb-5"><ErrorState message={error} /></div>}

      <div className="bg-[#121723]/80 border border-white/[0.08] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-50 mb-3">{doc.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>{company?.name ?? '—'}</span>
              <span className="text-slate-700">|</span>
              <span>{doc.line_of_business}</span>
              <span className="text-slate-700">|</span>
              <span>{doc.process_category}</span>
              <span className="text-slate-700">|</span>
              <span className="font-mono">v{doc.version}</span>
              <span className="text-slate-700">|</span>
              {statusBadge(doc.status)}
            </div>
            <div className="flex items-center gap-5 mt-4 text-sm text-slate-400">
              <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> {engagement?.view_count ?? 0} Views</span>
              <span className="flex items-center gap-1.5"><ThumbsUp className="w-4 h-4" /> {engagement?.like_count ?? 0} Likes</span>
            </div>
          </div>
        </div>

        {versions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
            >
              <History className="w-4 h-4" />
              Version History ({versions.length})
            </button>
            {showVersions && (
              <div className="mt-3 space-y-2 pl-6">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-slate-300">v{v.version}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${v.status === 'published' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.04] text-slate-500'}`}>
                      {v.status}
                    </span>
                    <span className="text-xs font-mono text-slate-600">{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-[#121723]/80 border border-white/[0.08] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-slate-500" /> SOP Content
          </h2>
          <span className="text-sm text-slate-500">
            {content?.content_type === 'steps' ? 'Step-by-step walkthrough (read-only preview)' : 'Review and edit before publishing'}
          </span>
        </div>
        {content?.content_type === 'steps' && content.steps ? (
          <div className="bg-white rounded-lg p-4">
            <StepsViewer steps={content.steps} />
          </div>
        ) : (
          <>
            <textarea
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              rows={16}
              className="w-full px-4 py-3.5 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono text-slate-100 resize-y"
            />
            <div className="mt-5 border border-white/[0.08] rounded-lg p-5 bg-white">
              <p className="text-sm font-medium text-slate-500 mb-3.5">Preview — this is what VAs will see</p>
              <DocumentViewer content={editableContent} images={content?.images} />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {doc.status !== 'published' && (
          <button
            onClick={() => updateStatus('published')}
            disabled={actionLoading}
            className="flex items-center gap-2 h-11 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 rounded-lg transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Approve & Publish
          </button>
        )}
        {doc.status === 'published' && (
          <button
            onClick={() => updateStatus('archived')}
            disabled={actionLoading}
            className="flex items-center gap-2 h-11 bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-sm font-medium px-5 rounded-lg transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Archive SOP
          </button>
        )}
        {doc.status === 'pending' && (
          <button
            onClick={() => updateStatus('archived')}
            disabled={actionLoading}
            className="flex items-center gap-2 h-11 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium px-5 rounded-lg transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" /> Reject
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={actionLoading}
          className="flex items-center gap-2 h-11 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium px-5 rounded-lg transition-colors disabled:opacity-50 ml-auto"
        >
          <XCircle className="w-4 h-4" /> Delete
        </button>
      </div>
    </div>
  );
}
