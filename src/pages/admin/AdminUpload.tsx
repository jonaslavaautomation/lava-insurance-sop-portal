import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase, type InsuranceCompany } from '@/lib/supabase';
import { extractTextFromFile } from '@/lib/extractDocument';

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
      // plain text — so every SOP renders the same way in the VA portal
      // regardless of whether it started as a PDF, a Word doc, or pasted
      // text.
      const text = await extractTextFromFile(file);
      setContent(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      setFileName('');
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

    const { error: contentError } = await supabase.from('sop_content').insert({
      sop_document_id: doc.id,
      content: content.trim(),
    });

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
            <p className="text-xs text-slate-400 text-center">or paste the SOP content below</p>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setFileName(''); }}
              rows={12}
              placeholder="Paste the full SOP document text here..."
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm font-mono resize-y"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || parsing}
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
    </div>
  );
}
