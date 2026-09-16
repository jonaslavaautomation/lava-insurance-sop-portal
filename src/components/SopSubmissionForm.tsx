import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Upload, FileText, Loader2, ImageIcon, ListOrdered, ShieldCheck, ScanEye, Building2, Server, AlertTriangle } from 'lucide-react';
import { supabase, type InsuranceCompany, type CompanySourceType, type SopStep, type SopCategory, type SopSubcategory } from '@/lib/supabase';
import { extractTextFromFile, type ExtractedImage } from '@/lib/extractDocument';
import { autoRedactImage } from '@/lib/autoRedactImage';
import { useAuth } from '@/context/AuthContext';
import { StepsViewer } from '@/components/StepsViewer';
import { ImageRedactor } from '@/components/ImageRedactor';
import { ErrorState, LoadingState } from '@/components/admin/DataStates';
import { SensitiveTextScanner } from '@/components/admin/SensitiveTextScanner';
import { StepsSensitiveTextScanner } from '@/components/admin/StepsSensitiveTextScanner';

/**
 * The full "create an SOP" form: pick a source/company, fill in the
 * metadata, upload or paste content (extracted + automatically PII-scanned
 * exactly the same way regardless of who's submitting), and submit as a
 * pending SOP for admin review.
 *
 * Shared by AdminUpload (admin-uploaded SOPs) and the VA portal's "Submit
 * an SOP" page - both create identical 'pending' rows reviewed through the
 * same Pending Reviews queue, so the extraction/redaction pipeline (which
 * has already needed several correctness fixes) lives in exactly one
 * place instead of two copies that could drift apart.
 */
export interface SopSubmissionFormProps {
  heading: string;
  description: string;
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onSuccess: () => void;
  /** Shows a read-only "Submitted by / Submitted on" box using the
   *  signed-in user's own name and the current date/time - neither is
   *  editable. Admin uploads don't need this (the uploader is implicit);
   *  VA submissions want it so review always shows who actually wrote it. */
  showSubmitterInfo?: boolean;
  /** Shown in place of the company/AMS picker when there are none yet.
   *  Admin gets a direct link to go add one; a VA can't manage companies,
   *  so they get a plain message instead. */
  renderNoCompanies?: (sourceType: CompanySourceType) => ReactNode;
}

export function SopSubmissionForm({
  heading,
  description,
  submitLabel,
  cancelLabel,
  onCancel,
  onSuccess,
  showSubmitterInfo = false,
  renderNoCompanies,
}: SopSubmissionFormProps) {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sourceType, setSourceType] = useState<CompanySourceType>('carrier');

  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [lineOfBusiness, setLineOfBusiness] = useState('Personal Lines');
  const [processCategory, setProcessCategory] = useState('');
  const [version, setVersion] = useState('1.0');
  // Workflow category/subcategory (the Carrier Workflow Hub an admin sets
  // up under Carrier Management -> Categories) - scoped to whichever
  // company is currently selected above, refetched whenever it changes.
  // Both are optional: "no category" and "category with no subcategory"
  // are both valid states, matching how VAs browse the portal.
  const [categories, setCategories] = useState<SopCategory[]>([]);
  const [subcategories, setSubcategories] = useState<SopSubcategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [steps, setSteps] = useState<SopStep[] | null>(null);
  // The as-extracted screenshots, before auto-redaction touches them —
  // kept around so opening the manual editor (below) always starts from a
  // clean source to fully re-scan/re-adjust, never from an already-baked
  // mosaic it can't undo.
  const [originalImages, setOriginalImages] = useState<ExtractedImage[]>([]);
  const [originalSteps, setOriginalSteps] = useState<SopStep[] | null>(null);
  const [autoRedacting, setAutoRedacting] = useState(false);
  // index -> how many sensitive regions the automatic pass found/redacted
  // on that screenshot (0 = scanned, nothing found).
  const [redactionCounts, setRedactionCounts] = useState<Record<number, number>>({});
  // index -> true if OCR itself errored for that screenshot (corrupt image,
  // worker load failure, etc.) - kept separate from redactionCounts so a
  // failed scan never renders as indistinguishable from a genuine "Clean"
  // (0 found) result; see the comment on AutoRedactResult.scanFailed.
  const [scanFailures, setScanFailures] = useState<Record<number, boolean>>({});
  const [redactorIndex, setRedactorIndex] = useState<number | null>(null);
  // Bumped on every new file selection so a slow auto-redaction pass from a
  // PREVIOUS file (still running when a second file is picked before it
  // finishes) can tell it's stale and bail out instead of splicing its
  // results into the new file's images/steps.
  const uploadGeneration = useRef(0);

  // First/last name split purely for display in the "Submitted by" box -
  // derived from the profile's own name, never typed in by the user, so
  // it can't be spoofed. Falls back to email if Google never supplied a
  // name (rare, but not impossible).
  const submitterName = useMemo(() => {
    const full = (profile?.full_name ?? '').trim();
    if (!full) return { first: profile?.email ?? '—', last: '' };
    const parts = full.split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(' ') };
  }, [profile]);
  const [submittedAtDisplay] = useState(() => new Date());

  // Unified view of "images that came out of this upload" — whichever
  // source they're in (steps or flat images) — always the current
  // (auto-redacted) versions, what's actually shown and uploaded.
  const reviewableImages: { index: number; dataUrl: string }[] =
    steps && steps.length > 0
      ? steps
          .map((s, i) => ({ index: i, dataUrl: s.imageUrl }))
          .filter((x): x is { index: number; dataUrl: string } => !!x.dataUrl)
      : images.map((im, i) => ({ index: i, dataUrl: im.dataUrl }));

  // The same list, but sourced from the untouched originals — what gets
  // handed to the manual editor so it can scan/adjust from scratch.
  const originalReviewableImages: { index: number; dataUrl: string }[] =
    originalSteps && originalSteps.length > 0
      ? originalSteps
          .map((s, i) => ({ index: i, dataUrl: s.imageUrl }))
          .filter((x): x is { index: number; dataUrl: string } => !!x.dataUrl)
      : originalImages.map((im, i) => ({ index: i, dataUrl: im.dataUrl }));

  function applyRedaction(index: number, redactedDataUrl: string) {
    if (steps && steps.length > 0) {
      setSteps((prev) => (prev ? prev.map((s, i) => (i === index ? { ...s, imageUrl: redactedDataUrl } : s)) : prev));
    } else {
      setImages((prev) => prev.map((im, i) => (i === index ? { ...im, dataUrl: redactedDataUrl } : im)));
    }
    setRedactorIndex(null);
  }

  // Runs the moment screenshots come out of an upload — OCRs each one,
  // detects likely sensitive insurance/customer fields, and bakes a
  // pixelated mosaic over just those spots, automatically. No click
  // required; the admin can still open any thumbnail afterward to review
  // or fully redo it (see originalImages/originalSteps above).
  async function autoRedactAll(extractedImages: ExtractedImage[], extractedSteps: SopStep[] | null, generation: number) {
    const targets = extractedSteps && extractedSteps.length > 0
      ? extractedSteps.map((s, i) => ({ index: i, dataUrl: s.imageUrl })).filter((x): x is { index: number; dataUrl: string } => !!x.dataUrl)
      : extractedImages.map((im, i) => ({ index: i, dataUrl: im.dataUrl }));

    if (targets.length === 0) {
      if (generation === uploadGeneration.current) setAutoRedacting(false);
      return;
    }

    setAutoRedacting(true);
    const results = await Promise.all(
      targets.map(async (t) => {
        try {
          const { redactedDataUrl, regions, scanFailed } = await autoRedactImage(t.dataUrl);
          return { index: t.index, redactedDataUrl, count: regions.length, scanFailed };
        } catch (err) {
          console.error('Automatic redaction failed for a screenshot:', err);
          return { index: t.index, redactedDataUrl: t.dataUrl, count: 0, scanFailed: true };
        }
      })
    );

    if (generation !== uploadGeneration.current) return;

    if (extractedSteps && extractedSteps.length > 0) {
      setSteps((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        for (const r of results) next[r.index] = { ...next[r.index], imageUrl: r.redactedDataUrl };
        return next;
      });
    } else {
      setImages((prev) => {
        const next = [...prev];
        for (const r of results) next[r.index] = { ...next[r.index], dataUrl: r.redactedDataUrl };
        return next;
      });
    }

    setRedactionCounts(Object.fromEntries(results.map((r) => [r.index, r.count])));
    setScanFailures(Object.fromEntries(results.map((r) => [r.index, r.scanFailed])));
    setAutoRedacting(false);
  }

  useEffect(() => {
    async function load() {
      const { data, error: loadError } = await supabase.from('insurance_companies').select('*').order('name');
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }
      setCompanies(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filteredCompanies = useMemo(() => companies.filter((c) => c.type === sourceType), [companies, sourceType]);

  useEffect(() => {
    if (filteredCompanies.length > 0 && !filteredCompanies.some((c) => c.id === companyId)) {
      setCompanyId(filteredCompanies[0].id);
    } else if (filteredCompanies.length === 0) {
      setCompanyId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCompanies]);

  // This company's workflow categories - refetched whenever the selected
  // company changes, since categories are entirely per-carrier/AMS. Any
  // previously-picked category/subcategory is cleared, since it almost
  // certainly doesn't belong to the newly-selected company.
  useEffect(() => {
    setCategoryId('');
    setSubcategoryId('');
    if (!companyId) { setCategories([]); setSubcategories([]); return; }
    let cancelled = false;
    async function loadCategories() {
      const { data: cats, error: catsError } = await supabase
        .from('sop_categories').select('*').eq('insurance_company_id', companyId).order('sort_order');
      if (cancelled) return;
      if (catsError) { console.error('Category load error:', catsError); setCategories([]); setSubcategories([]); return; }
      const catRows = (cats as SopCategory[]) ?? [];
      setCategories(catRows);
      if (catRows.length === 0) { setSubcategories([]); return; }
      const { data: subs, error: subsError } = await supabase
        .from('sop_subcategories').select('*').in('category_id', catRows.map((c) => c.id)).order('sort_order');
      if (cancelled) return;
      if (subsError) { console.error('Subcategory load error:', subsError); setSubcategories([]); return; }
      setSubcategories((subs as SopSubcategory[]) ?? []);
    }
    loadCategories();
    return () => { cancelled = true; };
  }, [companyId]);

  const subcategoryOptions = useMemo(() => subcategories.filter((s) => s.category_id === categoryId), [subcategories, categoryId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(0)}MB, which is over the 50MB limit. Split it into smaller documents or export a lighter-weight PDF.`);
      e.target.value = '';
      return;
    }
    const generation = ++uploadGeneration.current;
    setError(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const { text, images: extractedImages, steps: extractedSteps } = await extractTextFromFile(file);
      setContent(text);
      setImages(extractedImages);
      setSteps(extractedSteps ?? null);
      setOriginalImages(extractedImages);
      setOriginalSteps(extractedSteps ?? null);
      setRedactionCounts({}); setScanFailures({});
      void autoRedactAll(extractedImages, extractedSteps ?? null, generation);
    } catch (err) {
      if (generation !== uploadGeneration.current) return;
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      setFileName('');
      setImages([]);
      setSteps(null);
      setOriginalImages([]);
      setOriginalSteps(null);
      setRedactionCounts({}); setScanFailures({});
    } finally {
      if (generation === uploadGeneration.current) setParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!companyId) { setError(sourceType === 'ams' ? 'Please select an AMS.' : 'Please select an insurance company.'); return; }
    if (!title.trim()) { setError('Please enter a title.'); return; }
    if (!content.trim()) { setError('Please provide SOP content (paste text or upload a text file).'); return; }
    if (autoRedacting) { setError('Still scanning screenshots for sensitive info — one moment.'); return; }

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: doc, error: docError } = await supabase.from('sop_documents').insert({
      insurance_company_id: companyId,
      title: title.trim(),
      line_of_business: lineOfBusiness.trim(),
      process_category: processCategory.trim() || 'General',
      version: version.trim() || '1.0',
      status: 'pending',
      uploaded_by: user?.id ?? null,
      file_path: fileName || null,
      category_id: categoryId || null,
      subcategory_id: subcategoryId || null,
    }).select().single();

    if (docError) {
      setError(docError.message);
      setSubmitting(false);
      return;
    }

    const { error: contentError } = await supabase.from('sop_content').insert(
      steps && steps.length > 0
        ? {
            sop_document_id: doc.id,
            content: content.trim(),
            content_type: 'steps',
            steps,
          }
        : {
            sop_document_id: doc.id,
            content: content.trim(),
            images: images.length > 0 ? images : null,
          }
    );

    if (contentError) {
      setError(contentError.message);
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
    setTimeout(() => onSuccess(), 1500);
  }

  if (loading) return <LoadingState label="Loading..." />;

  if (companies.length === 0) {
    return (
      <div>
        {renderNoCompanies ? renderNoCompanies(sourceType) : (
          <ErrorState message="No insurance companies or AMS platforms exist yet." />
        )}
      </div>
    );
  }

  const inputClass = "w-full h-11 px-4 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100 placeholder:text-slate-600";
  const textareaClass = "w-full px-4 py-3.5 rounded-lg border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100 placeholder:text-slate-600";
  const labelClass = "block text-sm font-medium text-slate-400 mb-2";

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-50 mb-1">{heading}</h1>
      <p className="text-slate-500 text-base mb-6">{description}</p>

      {success && (
        <div className="mb-6 flex items-center gap-2.5 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3.5">
          <ShieldCheck className="w-4 h-4" /> Submitted successfully.
        </div>
      )}

      {error && <div className="mb-6"><ErrorState message={error} /></div>}

      <form onSubmit={handleSubmit} className="bg-[#121723]/80 rounded-xl border border-white/[0.08] p-6 space-y-6">
        {showSubmitterInfo && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className={labelClass}>First Name</label>
              <div className={`${inputClass} flex items-center bg-white/[0.02] text-slate-400 cursor-not-allowed`}>{submitterName.first}</div>
            </div>
            <div>
              <label className={labelClass}>Last Name</label>
              <div className={`${inputClass} flex items-center bg-white/[0.02] text-slate-400 cursor-not-allowed`}>{submitterName.last || '—'}</div>
            </div>
            <div>
              <label className={labelClass}>Submission Date</label>
              <div className={`${inputClass} flex items-center bg-white/[0.02] text-slate-400 cursor-not-allowed font-mono text-xs`}>
                {submittedAtDisplay.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>SOP Source</label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setSourceType('carrier')}
              className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
                sourceType === 'carrier'
                  ? 'bg-brand-600/15 border-brand-500/40 text-brand-400'
                  : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
            >
              <Building2 className="w-4 h-4" /> Insurance Carrier
            </button>
            <button
              type="button"
              onClick={() => setSourceType('ams')}
              className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
                sourceType === 'ams'
                  ? 'bg-brand-600/15 border-brand-500/40 text-brand-400'
                  : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
            >
              <Server className="w-4 h-4" /> AMS
            </button>
          </div>

          {filteredCompanies.length === 0 ? (
            <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
              {renderNoCompanies ? renderNoCompanies(sourceType) : (sourceType === 'ams' ? 'No AMS platforms yet.' : 'No insurance companies yet.')}
            </div>
          ) : (
            <>
              <label className={labelClass}>{sourceType === 'ams' ? 'AMS' : 'Insurance Company'}</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
                {filteredCompanies.map((c) => <option key={c.id} value={c.id} className="bg-ink-secondary">{c.name}</option>)}
              </select>
            </>
          )}
        </div>

        <div>
          <label className={labelClass}>SOP Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Cancellation Process SOP"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label className={labelClass}>Line of Business</label>
            <select value={lineOfBusiness} onChange={(e) => setLineOfBusiness(e.target.value)} className={inputClass}>
              <option className="bg-ink-secondary">Personal Lines</option>
              <option className="bg-ink-secondary">Commercial Lines</option>
              <option className="bg-ink-secondary">Claims</option>
              <option className="bg-ink-secondary">General</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Process Category</label>
            <input
              type="text"
              value={processCategory}
              onChange={(e) => setProcessCategory(e.target.value)}
              placeholder="e.g. Cancellation"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Workflow Category</label>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-600 h-11 flex items-center">
                No workflow categories set up for this {sourceType === 'ams' ? 'AMS' : 'carrier'} yet — leave blank, an admin can assign one during review.
              </p>
            ) : (
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }} className={inputClass}>
                <option value="" className="bg-ink-secondary">— No category —</option>
                {categories.map((c) => <option key={c.id} value={c.id} className="bg-ink-secondary">{c.name}</option>)}
              </select>
            )}
          </div>
          {categoryId && subcategoryOptions.length > 0 && (
            <div>
              <label className={labelClass}>Subcategory</label>
              <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} className={inputClass}>
                <option value="" className="bg-ink-secondary">— None —</option>
                {subcategoryOptions.map((s) => <option key={s.id} value={s.id} className="bg-ink-secondary">{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>SOP Content</label>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-dashed border-white/15 hover:border-brand-500/50 hover:bg-brand-500/[0.04] transition-all w-full">
                {parsing ? <Loader2 className="w-4 h-4 text-slate-500 animate-spin" /> : <Upload className="w-4 h-4 text-slate-500" />}
                <span className="text-sm">
                  {parsing ? 'Reading file…' : fileName || 'Upload a PDF, Word (.docx), or text file'}
                </span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.text"
                  onChange={handleFile}
                  disabled={parsing}
                  className="hidden"
                />
              </div>
            </label>
            {steps && steps.length > 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <ListOrdered className="w-3.5 h-3.5 flex-shrink-0" />
                This looks like a {steps.length}-step walkthrough — it'll display as a numbered guide with a screenshot per step, same as the file's own layout.
              </div>
            ) : (
              images.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  Found {images.length} image{images.length !== 1 ? 's' : ''} in this file — they'll be attached to this SOP.
                </div>
              )
            )}

            {steps && steps.length > 0 ? (
              <div>
                <div className="border border-white/[0.08] rounded-lg p-4 max-h-96 overflow-y-auto bg-white">
                  <p className="text-xs font-medium text-slate-500 mb-3">Preview</p>
                  <StepsViewer steps={steps} />
                </div>
                <button
                  type="button"
                  onClick={() => { setSteps(null); setImages([]); setOriginalSteps(null); setOriginalImages([]); setRedactionCounts({}); setScanFailures({}); setFileName(''); setContent(''); }}
                  className="text-xs text-slate-500 hover:text-slate-300 mt-2"
                >
                  Not right? Clear and paste text instead
                </button>
                <div className="mt-3">
                  <StepsSensitiveTextScanner steps={steps} onChange={setSteps} />
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600 text-center">or paste the SOP content below</p>
                <textarea
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setFileName(''); setImages([]); setSteps(null); setOriginalImages([]); setOriginalSteps(null); setRedactionCounts({}); setScanFailures({}); }}
                  rows={12}
                  placeholder="Paste the full SOP document text here..."
                  className={`${textareaClass} font-mono resize-y`}
                />
                {content.trim() && <SensitiveTextScanner content={content} onChange={setContent} />}
              </>
            )}
          </div>
        </div>

        {reviewableImages.length > 0 && (
          <div>
            <label className={labelClass}>
              Screenshots — Automatically Scanned &amp; Redacted
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Every screenshot is scanned automatically for likely customer/claim info (names, SSNs, policy
              and claim numbers, driver's license, VINs, bank/card numbers, contact details, addresses...)
              and only those exact spots are pixelated — nothing else on the image is touched, and nothing
              is left for you to click. Open any screenshot to double-check it or adjust it by hand.
            </p>
            {autoRedacting && (
              <div className="flex items-center gap-2 text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 mb-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                Scanning {reviewableImages.length} screenshot{reviewableImages.length !== 1 ? 's' : ''} for sensitive info…
              </div>
            )}
            {!autoRedacting && Object.values(scanFailures).some(Boolean) && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Automatic scanning failed on one or more screenshots (marked below) — open each one to check it manually before submitting.
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {reviewableImages.map(({ index, dataUrl }) => {
                const count = redactionCounts[index];
                const failed = scanFailures[index];
                return (
                  <div
                    key={index}
                    className={`relative rounded-lg border-2 overflow-hidden ${
                      autoRedacting ? 'border-white/15' : failed ? 'border-amber-500/60' : count ? 'border-emerald-500/50' : 'border-white/15'
                    }`}
                  >
                    <button type="button" onClick={() => setRedactorIndex(index)} className="block w-full">
                      <img src={dataUrl} alt={`Screenshot ${index + 1}`} className="w-full h-24 object-cover object-top" />
                    </button>
                    <div
                      className={`absolute top-1 right-1 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full pointer-events-none ${
                        autoRedacting
                          ? 'bg-white/20 text-slate-200'
                          : failed
                            ? 'bg-amber-500/25 text-amber-300'
                            : count
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-white/20 text-slate-300'
                      }`}
                    >
                      {autoRedacting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : failed ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : count ? (
                        <ShieldCheck className="w-3 h-3" />
                      ) : (
                        <ScanEye className="w-3 h-3" />
                      )}
                      {autoRedacting ? 'Scanning…' : failed ? 'Scan failed' : count ? `${count} redacted` : 'Clean'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || parsing || autoRedacting || !companyId}
            title={autoRedacting ? 'Still scanning screenshots for sensitive info' : undefined}
            className="h-11 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 rounded-lg transition-colors shadow-[0_0_0_1px_rgba(225,29,72,0.4),0_0_16px_-4px_rgba(255,42,95,0.6)] disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-11 text-sm text-slate-500 hover:text-slate-300 px-4"
          >
            {cancelLabel}
          </button>
        </div>
      </form>

      {redactorIndex !== null && originalReviewableImages.find((r) => r.index === redactorIndex) && (
        <div className="fixed inset-0 bg-black/60 z-30 flex items-center justify-center p-4" onClick={() => setRedactorIndex(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-900 mb-4">Review Screenshot</h2>
            <p className="text-xs text-slate-500 -mt-3 mb-4">
              Re-scanning the original — anything already auto-redacted stays that way unless you turn it off below.
            </p>
            <ImageRedactor
              dataUrl={originalReviewableImages.find((r) => r.index === redactorIndex)!.dataUrl}
              onApply={(redacted) => applyRedaction(redactorIndex, redacted)}
              onCancel={() => setRedactorIndex(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
