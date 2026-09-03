import { useEffect, useState } from 'react';
import { Shield, Search, Building2, FileText, ChevronRight, Loader2, Info, X } from 'lucide-react';
import { supabase, type InsuranceCompany, type SearchResult } from '@/lib/supabase';
import { LavaLogo } from '@/components/LavaLogo';

export default function VAPortal() {
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);

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

    const { data, error } = await supabase.rpc('search_sops', {
      p_company_id: selectedCompany,
      p_query: searchQuery.trim(),
    });

    if (error) {
      console.error('Search error:', error);
      setResults([]);
    } else {
      setResults((data as SearchResult[]) ?? []);
    }
    setSearching(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LavaLogo className="w-10 h-10 rounded-xl" />
            <div>
              <h1 className="text-base font-bold text-slate-900">Insurance SOP Search Portal</h1>
              <p className="text-xs text-slate-400">LAVA Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Shield className="w-3.5 h-3.5" />
            VA / Student Portal
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-brand-600" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900">Select Insurance Company</label>
              <p className="text-xs text-slate-400">Choose the company to search within</p>
            </div>
          </div>
          <select
            value={selectedCompany}
            onChange={(e) => { setSelectedCompany(e.target.value); setHasSearched(false); setResults([]); }}
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm bg-white"
          >
            <option value="">{loading ? 'Loading...' : 'Select an insurance company...'}</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedCompany && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
                <Search className="w-4.5 h-4.5 text-green-600" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900">Search Process / Workflow</label>
                <p className="text-xs text-slate-400">Search within {companies.find((c) => c.id === selectedCompany)?.name} approved SOPs</p>
              </div>
            </div>
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Cancellation, Claims, Underwriting..."
                  className="w-full pl-9 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </form>
          </div>
        )}

        {searching && (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Searching approved SOPs...</p>
          </div>
        )}

        {!searching && hasSearched && results.length === 0 && !selectedResult && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-2xl mb-4">
              <Info className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">No information was found</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              No information was found in the available SOP documents for "{searchQuery}".
              The system does not generate alternative processes. Please try a different search term.
            </p>
          </div>
        )}

        {!searching && hasSearched && results.length > 0 && !selectedResult && (
          <div>
            <p className="text-sm text-slate-500 mb-4">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
            <div className="space-y-3">
              {results.map((result) => (
                <button
                  key={result.document_id}
                  onClick={() => setSelectedResult(result)}
                  className="w-full text-left bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-brand-300 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-brand-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{result.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-500">{result.process_category}</span>
                          <span className="text-xs text-slate-300">|</span>
                          <span className="text-xs text-slate-500">{result.line_of_business}</span>
                          <span className="text-xs text-slate-300">|</span>
                          <span className="text-xs text-slate-500">v{result.version}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-brand-600 text-sm font-medium">
                      View SOP
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!searching && !hasSearched && selectedCompany && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-5 flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-brand-900 font-medium">Ready to search</p>
              <p className="text-xs text-brand-700 mt-1">
                Enter a process or workflow term above to search within the approved SOP documents for {companies.find((c) => c.id === selectedCompany)?.name}.
                Only published SOPs are included in search results.
              </p>
            </div>
          </div>
        )}

        {!searching && !hasSearched && !selectedCompany && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm">Select an insurance company above to begin searching.</p>
          </div>
        )}
      </main>

      {selectedResult && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-center justify-center p-4" onClick={() => setSelectedResult(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selectedResult.title}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-500">{selectedResult.insurance_company_name}</span>
                  <span className="text-xs text-slate-300">|</span>
                  <span className="text-xs text-slate-500">{selectedResult.process_category}</span>
                  <span className="text-xs text-slate-300">|</span>
                  <span className="text-xs text-slate-500">{selectedResult.line_of_business}</span>
                  <span className="text-xs text-slate-300">|</span>
                  <span className="text-xs text-slate-500">v{selectedResult.version}</span>
                </div>
              </div>
              <button onClick={() => setSelectedResult(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 overflow-y-auto">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">{selectedResult.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
