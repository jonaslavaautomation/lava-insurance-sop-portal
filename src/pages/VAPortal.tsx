import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, FileText, ChevronRight, Loader2, Info, X, LogOut, Eye, ThumbsUp } from 'lucide-react';
import { supabase, type InsuranceCompany, type SearchResult, type SopEngagement } from '@/lib/supabase';
import { LavaLogo } from '@/components/LavaLogo';
import { StepsViewer } from '@/components/StepsViewer';
import { DocumentViewer } from '@/components/DocumentViewer';
import { useAuth } from '@/context/AuthContext';

export default function VAPortal() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [engagement, setEngagement] = useState<Record<string, SopEngagement>>({});
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('insurance_companies').select('*').order('name');
      setCompanies(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany || !searchQuery.trim()) return;
    setSearching(true);
    setHasSearched(true);
    setSelectedResult(null);

    const query = searchQuery.trim();
    const { data, error } = await supabase.rpc('search_sops', {
      p_company_id: selectedCompany,
      p_query: query,
    });

    let rows: SearchResult[] = [];
    if (error) {
      console.error('Search error:', error);
      setResults([]);
    } else {
      rows = (data as SearchResult[]) ?? [];
      setResults(rows);
      void loadEngagement(rows.map((r) => r.document_id));
    }
    setSearching(false);

    // Logs the real search so the Training Department can eventually see
    // which processes are searched for most, and which searches come up
    // empty — never surfaced anywhere as a fabricated number.
    if (profile) {
      const { error: logError } = await supabase.from('sop_searches').insert({
        user_id: profile.id,
        insurance_company_id: selectedCompany,
        search_query: query,
        result_count: rows.length,
      });
      if (logError) console.error('Search logging error:', logError);
    }
  }

  // Fetches (or refreshes) view/like counts for a set of SOPs in one batched
  // call. Counts are always computed fresh from sop_views/sop_likes - never
  // a stored counter - so this can be called as often as needed.
  async function loadEngagement(documentIds: string[]) {
    if (documentIds.length === 0) return;
    const { data, error } = await supabase.rpc('get_sop_engagement', { p_sop_ids: documentIds });
    if (error) {
      console.error('Engagement fetch error:', error);
      return;
    }
    setEngagement((prev) => {
      const next = { ...prev };
      for (const row of (data as SopEngagement[]) ?? []) next[row.sop_document_id] = row;
      return next;
    });
  }

  // Records a view the moment a VA actually opens an SOP's detail content -
  // never on search results merely rendering, and never for admins browsing
  // the portal (they can also reach /portal via the "VA Portal" link).
  async function openResult(result: SearchResult) {
    setSelectedResult(result);
    setLiked(false);

    if (profile && profile.role !== 'admin') {
      const { error } = await supabase
        .from('sop_views')
        .insert({ sop_document_id: result.document_id, user_id: profile.id });
      if (error) console.error('View tracking error:', error);
    }

    if (profile) {
      const { data: likeRow } = await supabase
        .from('sop_likes')
        .select('id')
        .eq('sop_document_id', result.document_id)
        .eq('user_id', profile.id)
        .maybeSingle();
      setLiked(!!likeRow);
    }

    void loadEngagement([result.document_id]);
  }

  async function toggleLike() {
    if (!selectedResult || !profile || likeBusy) return;
    setLikeBusy(true);
    const documentId = selectedResult.document_id;

    if (liked) {
      const { error } = await supabase
        .from('sop_likes')
        .delete()
        .eq('sop_document_id', documentId)
        .eq('user_id', profile.id);
      if (!error) setLiked(false);
      else console.error('Unlike error:', error);
    } else {
      const { error } = await supabase
        .from('sop_likes')
        .insert({ sop_document_id: documentId, user_id: profile.id });
      if (!error) setLiked(true);
      else console.error('Like error:', error);
    }

    await loadEngagement([documentId]);
    setLikeBusy(false);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-ink text-slate-200">
      <header className="bg-ink-secondary/80 backdrop-blur-sm border-b border-white/[0.06] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
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

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-[#121723]/80 border border-white/[0.08] rounded-lg p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-sky-500/10 rounded-md flex items-center justify-center">
              <Building2 className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-slate-100">Select Insurance Company</label>
              <p className="text-xs text-slate-500">Choose the company to search within</p>
            </div>
          </div>
          <select
            value={selectedCompany}
            onChange={(e) => { setSelectedCompany(e.target.value); setHasSearched(false); setResults([]); }}
            disabled={loading}
            className="w-full px-3.5 py-2.5 rounded-md border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100"
          >
            <option value="" className="bg-ink-secondary">{loading ? 'Loading...' : 'Select an insurance company...'}</option>
            {companies.map((c) => <option key={c.id} value={c.id} className="bg-ink-secondary">{c.name}</option>)}
          </select>
        </div>

        {selectedCompany && (
          <div className="bg-[#121723]/80 border border-white/[0.08] rounded-lg p-5 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-md flex items-center justify-center">
                <Search className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-slate-100">Search Process / Workflow</label>
                <p className="text-xs text-slate-500">Search within {companies.find((c) => c.id === selectedCompany)?.name} approved SOPs</p>
              </div>
            </div>
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Cancellation, Claims, Underwriting..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-md border border-white/10 bg-white/[0.03] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-100 placeholder:text-slate-600"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 py-2.5 rounded-md transition-colors shadow-[0_0_0_1px_rgba(225,29,72,0.4),0_0_16px_-4px_rgba(255,42,95,0.6)] disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </form>
          </div>
        )}

        {searching && (
          <div className="text-center py-12">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Searching approved SOPs...</p>
          </div>
        )}

        {!searching && hasSearched && results.length === 0 && !selectedResult && (
          <div className="bg-[#121723]/80 border border-white/[0.08] rounded-lg p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-white/[0.04] rounded-lg mb-4">
              <Info className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100 mb-2">No information was found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No information was found in the available SOP documents for &ldquo;{searchQuery}&rdquo;.
              The system does not generate alternative processes. Please try a different search term.
            </p>
          </div>
        )}

        {!searching && hasSearched && results.length > 0 && !selectedResult && (
          <div>
            <p className="text-xs text-slate-500 mb-3">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
            <div className="space-y-2.5">
              {results.map((result) => (
                <button
                  key={result.document_id}
                  onClick={() => openResult(result)}
                  className="w-full text-left bg-[#121723]/80 rounded-lg border border-white/[0.08] p-4 hover:border-brand-500/40 hover:bg-[#161c2b] transition-all group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 bg-brand-500/10 rounded-md flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-brand-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-100 truncate">{result.title}</p>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
                          <span className="text-[11px] text-slate-500">{result.process_category}</span>
                          <span className="text-[11px] text-slate-700">|</span>
                          <span className="text-[11px] text-slate-500">{result.line_of_business}</span>
                          <span className="text-[11px] text-slate-700">|</span>
                          <span className="text-[11px] font-mono text-slate-500">v{result.version}</span>
                          <span className="text-[11px] text-slate-700">|</span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {engagement[result.document_id]?.view_count ?? 0}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" /> {engagement[result.document_id]?.like_count ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-brand-400 text-xs font-medium flex-shrink-0">
                      View SOP
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!searching && !hasSearched && selectedCompany && (
          <div className="bg-brand-500/[0.06] border border-brand-500/20 rounded-lg p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-slate-200 font-medium">Ready to search</p>
              <p className="text-xs text-slate-400 mt-1">
                Enter a process or workflow term above to search within the approved SOP documents for {companies.find((c) => c.id === selectedCompany)?.name}.
                Only published SOPs are included in search results.
              </p>
            </div>
          </div>
        )}

        {!searching && !hasSearched && !selectedCompany && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-white/[0.04] rounded-lg mb-4">
              <Building2 className="w-7 h-7 text-slate-600" />
            </div>
            <p className="text-slate-500 text-sm">Select an insurance company above to begin searching.</p>
          </div>
        )}
      </main>

      {selectedResult && (
        <div className="fixed inset-0 bg-black/60 z-20 flex items-center justify-center p-4" onClick={() => setSelectedResult(null)}>
          <div className="bg-ink-secondary border border-white/10 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-50">{selectedResult.title}</h2>
                <div className="flex items-center gap-2.5 mt-1">
                  <span className="text-xs text-slate-500">{selectedResult.insurance_company_name}</span>
                  <span className="text-xs text-slate-700">|</span>
                  <span className="text-xs text-slate-500">{selectedResult.process_category}</span>
                  <span className="text-xs text-slate-700">|</span>
                  <span className="text-xs text-slate-500">{selectedResult.line_of_business}</span>
                  <span className="text-xs text-slate-700">|</span>
                  <span className="text-xs font-mono text-slate-500">v{selectedResult.version}</span>
                </div>
                <div className="flex items-center gap-4 mt-2.5">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> {engagement[selectedResult.document_id]?.view_count ?? 0} Views
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <ThumbsUp className="w-3.5 h-3.5" /> {engagement[selectedResult.document_id]?.like_count ?? 0} Likes
                  </span>
                  <button
                    onClick={toggleLike}
                    disabled={likeBusy}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${
                      liked
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:border-brand-500/40 hover:text-brand-400'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    {liked ? 'Liked' : 'Like'}
                  </button>
                </div>
              </div>
              <button onClick={() => setSelectedResult(null)} className="text-slate-500 hover:text-slate-200 p-1 rounded-md hover:bg-white/[0.06] transition-colors flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto bg-white rounded-b-xl">
              {selectedResult.content_type === 'steps' && selectedResult.steps ? (
                <StepsViewer steps={selectedResult.steps} />
              ) : (
                <DocumentViewer content={selectedResult.content} images={selectedResult.images} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
