import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Archive, Loader2, FileText, History, Eye, ThumbsUp, User, ImageIcon, Save } from 'lucide-react';
import { supabase, type SopDocument, type SopContent, type SopVersion, type InsuranceCompany, type SopEngagement, type SopImage, type SopStep, type SopCategory, type SopSubcategory } from '@/lib/supabase';
import { StepsViewer } from '@/components/StepsViewer';
import { DocumentViewer } from '@/components/DocumentViewer';
import { ImageRedactor } from '@/components/ImageRedactor';
import { ErrorState } from '@/components/admin/DataStates';
import { SensitiveTextScanner } from '@/components/admin/SensitiveTextScanner';
import { StepsSensitiveTextScanner } from '@/components/admin/StepsSensitiveTextScanner';

export default function AdminReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<SopDocument | null>(null);
  const [content, setContent] = useState<SopContent | null>(null);
  const [company, setCompany] = useState<InsuranceCompany | null>(null);
  const [submitterName, setSubmitterName] = useState<string | null>(null);
  const [versions, setVersions] = useState<SopVersion[]>([]);
  const [engagement, setEngagement] = useState<SopEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState('');
  // Screenshots can still be opened and manually redacted here, even
  // though the automatic scan already ran at upload time - it's a
  // best-effort pass, not a guarantee (see its own docs), and this is the
  // last checkpoint before a SOP goes live. Kept as two separate arrays
  // (only one is ever relevant, based on content_type) rather than one
  // union type, to match SopContent's own shape.
  const [editableImages, setEditableImages] = useState<SopImage[]>([]);
  const [editableSteps, setEditableSteps] = useState<SopStep[]>([]);
  const [redactorIndex, setRedactorIndex] = useState<number | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  // Workflow category/subcategory assignment - lets an admin move an SOP
  // between categories (or out of one entirely) right from the review
  // screen, on top of whatever the submitter picked (if anything) in
  // SopSubmissionForm. Both empty-string sentinels map to null on save.
  const [categories, setCategories] = useState<SopCategory[]>([]);
  const [subcategories, setSubcategories] = useState<SopSubcategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data: d } = await supabase.from('sop_documents').select('*').eq('id', id).maybeSingle();
      if (!d) { setLoading(false); return; }
      setDoc(d as SopDocument);

      const { data: c } = await supabase.from('sop_content').select('*').eq('sop_document_id', id).maybeSingle();
      setContent(c as SopContent | null);
      setEditableContent(c?.content ?? '');
      setEditableImages(c?.images ?? []);
      setEditableSteps(c?.steps ?? []);
      setCategoryId(d.category_id ?? '');
      setSubcategoryId(d.subcategory_id ?? '');

      if (d) {
        const { data: comp } = await supabase.from('insurance_companies').select('*').eq('id', d.insurance_company_id).maybeSingle();
        setCompany(comp as InsuranceCompany | null);

        const { data: cats } = await supabase.from('sop_categories').select('*').eq('insurance_company_id', d.insurance_company_id).order('sort_order');
        const catRows = (cats as SopCategory[]) ?? [];
        setCategories(catRows);
        if (catRows.length > 0) {
          const { data: subs } = await supabase.from('sop_subcategories').select('*').in('category_id', catRows.map((c) => c.id)).order('sort_order');
          setSubcategories((subs as SopSubcategory[]) ?? []);
        }

        const { data: vers } = await supabase.from('sop_versions').select('*').eq('sop_document_id', id).order('created_at', { ascending: false });
        setVersions(vers ?? []);

        const { data: eng } = await supabase.rpc('get_sop_engagement', { p_sop_ids: [id] });
        setEngagement(((eng as SopEngagement[]) ?? [])[0] ?? null);

        // Who actually submitted this - blank for an admin's own upload,
        // shown for a VA's submission so it's clear at a glance whose work
        // is being reviewed.
        if (d.uploaded_by) {
          const { data: submitter } = await supabase.from('profiles').select('full_name, email').eq('id', d.uploaded_by).maybeSingle();
          if (submitter) setSubmitterName(submitter.full_name?.trim() || submitter.email);
        }
      }

      setLoading(false);
    }
    load();
  }, [id]);

  // What's actually changed since load - only sent to the database if
  // non-empty, and only the fields that changed (never overwrites the
  // other content_type's own field with a stale/empty value).
  function buildContentUpdates(): Record<string, unknown> {
    if (!content) return {};
    const updates: Record<string, unknown> = {};
    if (content.content_type === 'steps') {
      if (JSON.stringify(editableSteps) !== JSON.stringify(content.steps ?? [])) {
        updates.steps = editableSteps;
      }
    } else {
      if (editableContent !== content.content) updates.content = editableContent.trim();
      if (JSON.stringify(editableImages) !== JSON.stringify(content.images ?? [])) {
        updates.images = editableImages;
      }
    }
    return updates;
  }

  const subcategoryOptions = useMemo(() => subcategories.filter((s) => s.category_id === categoryId), [subcategories, categoryId]);

  // Shared by "Save Changes" and every status-changing action - a manual
  // redaction fix (or a text edit) needs to actually reach the database
  // regardless of which button triggered the save, and a failure here
  // must stop a publish/archive from proceeding with an unsaved fix.
  async function persistContentChanges(): Promise<boolean> {
    if (!id) return false;
    const updates = buildContentUpdates();
    if (Object.keys(updates).length === 0) return true;
    const { error: contentError } = await supabase.from('sop_content').update(updates).eq('sop_document_id', id);
    if (contentError) {
      setError(`Could not save your changes: ${contentError.message}`);
      return false;
    }
    // Reflect the save locally so a second save (or a status change right
    // after) correctly sees nothing left to persist.
    setContent((prev) => (prev ? { ...prev, ...updates } : prev));
    return true;
  }

  // Same pattern as persistContentChanges, for the category/subcategory
  // assignment - a separate sop_documents update since it's doc-level
  // metadata, not content.
  async function persistCategoryAssignment(): Promise<boolean> {
    if (!id || !doc) return false;
    const nextCategoryId = categoryId || null;
    const nextSubcategoryId = subcategoryId || null;
    if (nextCategoryId === doc.category_id && nextSubcategoryId === doc.subcategory_id) return true;
    const { error: catError } = await supabase.from('sop_documents').update({
      category_id: nextCategoryId,
      subcategory_id: nextSubcategoryId,
    }).eq('id', id);
    if (catError) {
      setError(`Could not save the category assignment: ${catError.message}`);
      return false;
    }
    setDoc((prev) => (prev ? { ...prev, category_id: nextCategoryId, subcategory_id: nextSubcategoryId } : prev));
    return true;
  }

  async function handleSaveChanges() {
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    const contentOk = await persistContentChanges();
    const categoryOk = contentOk && await persistCategoryAssignment();
    setActionLoading(false);
    if (contentOk && categoryOk) setSuccess('Changes saved.');
  }

  async function updateStatus(status: 'published' | 'archived') {
    if (!id) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    // Every write below is checked and aborts the whole action on failure —
    // a failed content save or version write must never let the SOP get
    // marked published anyway with no indication something went wrong.
    const contentSaved = await persistContentChanges();
    if (!contentSaved) {
      setActionLoading(false);
      return;
    }
    const categorySaved = await persistCategoryAssignment();
    if (!categorySaved) {
      setActionLoading(false);
      return;
    }

    // If publishing, archive any currently-published versions of this doc
    if (status === 'published') {
      const { error: archiveError } = await supabase.from('sop_versions').update({ status: 'archived' }).eq('sop_document_id', id).eq('status', 'published');
      if (archiveError) {
        setError(`Could not archive the previous version: ${archiveError.message}`);
        setActionLoading(false);
        return;
      }
      const { error: versionError } = await supabase.from('sop_versions').insert({
        sop_document_id: id,
        version: doc?.version ?? '1.0',
        status: 'published',
      });
      if (versionError) {
        setError(`Could not record the new version: ${versionError.message}`);
        setActionLoading(false);
        return;
      }
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

  // Unified "screenshots that can be opened and manually redacted here" —
  // whichever content_type this SOP is, same as SopSubmissionForm's own
  // reviewableImages, so the redactor modal below only needs one code path.
  const isSteps = content?.content_type === 'steps';
  const reviewableImages: { index: number; dataUrl: string }[] = isSteps
    ? editableSteps.map((s, i) => ({ index: i, dataUrl: s.imageUrl })).filter((x): x is { index: number; dataUrl: string } => !!x.dataUrl)
    : editableImages.map((im, i) => ({ index: i, dataUrl: im.dataUrl }));

  function applyRedaction(index: number, redactedDataUrl: string) {
    if (isSteps) {
      setEditableSteps((prev) => prev.map((s, i) => (i === index ? { ...s, imageUrl: redactedDataUrl } : s)));
    } else {
      setEditableImages((prev) => prev.map((im, i) => (i === index ? { ...im, dataUrl: redactedDataUrl } : im)));
    }
    setRedactorIndex(null);
    setSuccess(null);
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
      {success && (
        <div className="mb-5 flex items-center gap-2.5 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
          <CheckCircle className="w-4 h-4" /> {success}
        </div>
      )}

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
              {submitterName && (
                <span className="flex items-center gap-1.5 text-sky-400">
                  <User className="w-4 h-4" /> Submitted by {submitterName}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Workflow Category</label>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-600 h-10 flex items-center">
                No workflow categories set up for {company?.name ?? 'this company'} yet.
              </p>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); setSuccess(null); }}
                className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100"
              >
                <option value="" className="bg-ink-secondary">— No category —</option>
                {categories.map((c) => <option key={c.id} value={c.id} className="bg-ink-secondary">{c.name}</option>)}
              </select>
            )}
          </div>
          {categoryId && subcategoryOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Subcategory</label>
              <select
                value={subcategoryId}
                onChange={(e) => { setSubcategoryId(e.target.value); setSuccess(null); }}
                className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100"
              >
                <option value="" className="bg-ink-secondary">— None —</option>
                {subcategoryOptions.map((s) => <option key={s.id} value={s.id} className="bg-ink-secondary">{s.name}</option>)}
              </select>
            </div>
          )}
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
            {isSteps ? 'Step-by-step walkthrough (text is read-only; screenshots can still be redacted below)' : 'Review and edit before publishing'}
          </span>
        </div>
        {isSteps ? (
          <>
            <div className="bg-white rounded-lg p-4">
              <StepsViewer steps={editableSteps} />
            </div>
            <div className="mt-3">
              <StepsSensitiveTextScanner steps={editableSteps} onChange={setEditableSteps} />
            </div>
          </>
        ) : (
          <>
            <textarea
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              rows={16}
              className="w-full px-4 py-3.5 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono text-slate-100 resize-y"
            />
            <div className="mt-3">
              <SensitiveTextScanner content={editableContent} onChange={setEditableContent} />
            </div>
            <div className="mt-5 border border-white/[0.08] rounded-lg p-5 bg-white">
              <p className="text-sm font-medium text-slate-500 mb-3.5">Preview — this is what VAs will see</p>
              <DocumentViewer content={editableContent} images={editableImages} />
            </div>
          </>
        )}
      </div>

      {reviewableImages.length > 0 && (
        <div className="bg-[#121723]/80 border border-white/[0.08] rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2.5 mb-1.5">
            <ImageIcon className="w-5 h-5 text-slate-500" /> Screenshots
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            These were already scanned automatically on upload — that's a best-effort pass, not a guarantee. Open any
            screenshot to double-check it or blur anything it missed before publishing.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {reviewableImages.map(({ index, dataUrl }) => (
              <button
                key={index}
                type="button"
                onClick={() => setRedactorIndex(index)}
                className="rounded-lg border-2 border-white/15 hover:border-brand-500/50 overflow-hidden transition-colors"
              >
                <img src={dataUrl} alt={`Screenshot ${index + 1}`} className="w-full h-20 object-cover object-top" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSaveChanges}
          disabled={actionLoading}
          className="flex items-center gap-2 h-11 bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-sm font-medium px-5 rounded-lg transition-colors disabled:opacity-50"
        >
          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
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

      {redactorIndex !== null && reviewableImages.find((r) => r.index === redactorIndex) && (
        <div className="fixed inset-0 bg-black/60 z-30 flex items-center justify-center p-4" onClick={() => setRedactorIndex(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-900 mb-4">Review Screenshot</h2>
            <p className="text-xs text-slate-500 -mt-3 mb-4">
              Changes apply to this preview immediately — click "Save Changes" (or Publish) below to make them permanent.
            </p>
            <ImageRedactor
              dataUrl={reviewableImages.find((r) => r.index === redactorIndex)!.dataUrl}
              onApply={(redacted) => applyRedaction(redactorIndex, redacted)}
              onCancel={() => setRedactorIndex(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
