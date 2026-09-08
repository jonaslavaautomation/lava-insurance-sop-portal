import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle, ImageIcon, ListOrdered, ShieldCheck, EyeOff } from 'lucide-react';
import { supabase, type InsuranceCompany, type SopStep } from '@/lib/supabase';
import { extractTextFromFile, type ExtractedImage } from '@/lib/extractDocument';
import { StepsViewer } from '@/components/StepsViewer';
import { ImageRedactor } from '@/components/ImageRedactor';

export default function AdminUpload() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [lineOfBusiness, setLineOfBusiness] = useState('Personal Lines');
  const [processCategory, setProcessCategory] = useState('');
  const [version, setVersion] = useState('1.0');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [steps, setSteps] = useState<SopStep[] | null>(null);
  const [reviewedIndices, setReviewedIndices] = useState<Set<number>>(new Set());
  const [redactorIndex, setRedactorIndex] = useState<number | null>(null);

  // Unified view of "images that came out of this upload and need a look
  // before publishing" — whichever source they're in (steps or flat images).
  const reviewableImages: { index: number; dataUrl: string }[] =
    steps && steps.length > 0
      ? steps
          .map((s, i) => ({ index: i, dataUrl: s.imageUrl }))
          .filter((x): x is { index: number; dataUrl: string } => !!x.dataUrl)
      : images.map((im, i) => ({ index: i, dataUrl: im.dataUrl }));

  const allImagesReviewed = reviewableImages.every((r) => reviewedIndices.has(r.index));

  function applyRedaction(index: number, redactedDataUrl: string) {
    if (steps && steps.length > 0) {
      setSteps((prev) => (prev ? prev.map((s, i) => (i === index ? { ...s, imageUrl: redactedDataUrl } : s)) : prev));
    } else {
      setImages((prev) => prev.map((im, i) => (i === index ? { ...im, dataUrl: redactedDataUrl } : im)));
    }
    setReviewedIndices((prev) => new Set(prev).add(index));
    setRedactorIndex(null);
  }

  function markNoRedactionNeeded(index: number) {
    setReviewedIndices((prev) => new Set(prev).add(index));
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('insurance_companies').select('*').order('name');
      setCompanies(data ?? []);
      if (data && data.length > 0) setCompanyId(data[0].id);
      setLoading(false);
    }
    load();
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setParsing(true);
    try {
      // Whatever format this came in as, it ends up as the same kind of
      // plain text (plus any embedded photos) — so every SOP renders the
      // same way in the VA portal regardless of whether it started as a
      // PDF, a Word doc, or pasted text.
      const { text, images: extractedImages, steps: extractedSteps } = await extractTextFromFile(file);
      setContent(text);
      setImages(extractedImages);
      setSteps(extractedSteps ?? null);
      setReviewedIndices(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      setFileName('');
      setImages([]);
      setSteps(null);
      setReviewedIndices(new Set());
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!companyId) { setError('Please select an insurance company.'); return; }
    if (!title.trim()) { setError('Please enter a title.'); return; }
    if (!content.trim()) { setError('Please provide SOP content (paste text or upload a text file).'); return; }
    if (!allImagesReviewed) { setError('Please review every screenshot for sensitive info before uploading.'); return; }

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
    setTimeout(() => navigate('/admin/review'), 1500);
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm animate-pulse">Loading...</div>;

  if (companies.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Upload SOP</h1>
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-amber-700">You need to add an insurance company before uploading SOPs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Upload SOP Document</h1>
      <p className="text-slate-500 text-sm mb-6">
        Upload a PDF, Word document, or plain text file — the text is extracted automatically and
        normalized to the same format VAs see for every SOP, no matter what it was uploaded as.
      </p>

      {success && (
        <div className="mb-6 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle className="w-4 h-4" /> SOP uploaded successfully. Redirecting to review...
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Insurance Company</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm bg-white"
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">SOP Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Cancellation Process SOP"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Line of Business</label>
            <select
              value={lineOfBusiness}
              onChange={(e) => setLineOfBusiness(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm bg-white"
            >
              <option>Personal Lines</option>
              <option>Commercial Lines</option>
              <option>Claims</option>
              <option>General</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Process Category</label>
            <input
              type="text"
              value={processCategory}
              onChange={(e) => setProcessCategory(e.target.value)}
              placeholder="e.g. Cancellation"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">SOP Content</label>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/50 transition-all w-full">
                {parsing ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : <Upload className="w-4 h-4 text-slate-400" />}
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
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <ListOrdered className="w-3.5 h-3.5 flex-shrink-0" />
                This looks like a {steps.length}-step walkthrough — it'll display as a numbered guide with a screenshot per step, same as the file's own layout.
              </div>
            ) : (
              images.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  Found {images.length} image{images.length !== 1 ? 's' : ''} in this file — they'll be attached to this SOP.
                </div>
              )
            )}

            {steps && steps.length > 0 ? (
              <div>
                <div className="border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto bg-slate-50">
                  <p className="text-xs font-medium text-slate-500 mb-3">Preview</p>
                  <StepsViewer steps={steps} />
                </div>
                <button
                  type="button"
                  onClick={() => { setSteps(null); setImages([]); setFileName(''); setContent(''); setReviewedIndices(new Set()); }}
                  className="text-xs text-slate-400 hover:text-slate-600 mt-2"
                >
                  Not right? Clear and paste text instead
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 text-center">or paste the SOP content below</p>
                <textarea
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setFileName(''); setImages([]); setSteps(null); setReviewedIndices(new Set()); }}
                  rows={12}
                  placeholder="Paste the full SOP document text here..."
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm font-mono resize-y"
                />
              </>
            )}
          </div>
        </div>

        {reviewableImages.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Review Screenshots for Sensitive Info
            </label>
            <p className="text-xs text-slate-400 mb-3">
              Each screenshot is scanned for likely customer info (names, policy numbers, VINs, contact
              details, addresses...) — accept, adjust, or draw your own boxes, then apply to black it out.
              Every screenshot needs a look before this can be uploaded.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {reviewableImages.map(({ index, dataUrl }) => {
                const reviewed = reviewedIndices.has(index);
                return (
                  <div
                    key={index}
                    className={`relative rounded-lg border-2 overflow-hidden ${
                      reviewed ? 'border-green-400' : 'border-amber-300'
                    }`}
                  >
                    <button type="button" onClick={() => setRedactorIndex(index)} className="block w-full">
                      <img src={dataUrl} alt={`Screenshot ${index + 1}`} className="w-full h-24 object-cover object-top" />
                    </button>
                    <div
                      className={`absolute top-1 right-1 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full pointer-events-none ${
                        reviewed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {reviewed ? <ShieldCheck className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {reviewed ? 'Reviewed' : 'Needs review'}
                    </div>
                    {!reviewed && (
                      <button
                        type="button"
                        onClick={() => markNoRedactionNeeded(index)}
                        className="absolute bottom-1 right-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/90 text-slate-600 hover:bg-white"
                      >
                        No PII, skip
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {!allImagesReviewed && (
              <p className="text-xs text-amber-600 mt-2">
                {reviewableImages.length - reviewedIndices.size} of {reviewableImages.length} screenshot
                {reviewableImages.length !== 1 ? 's' : ''} still need{reviewableImages.length === 1 ? 's' : ''} review.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || parsing || !allImagesReviewed}
            title={!allImagesReviewed ? 'Review every screenshot for sensitive info first' : undefined}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Upload SOP
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/library')}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5"
          >
            Cancel
          </button>
        </div>
      </form>

      {redactorIndex !== null && reviewableImages.find((r) => r.index === redactorIndex) && (
        <div className="fixed inset-0 bg-black/50 z-30 flex items-center justify-center p-4" onClick={() => setRedactorIndex(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-900 mb-4">Review Screenshot</h2>
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
