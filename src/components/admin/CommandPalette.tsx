import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Building2, CornerDownLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SopHit {
  kind: 'sop';
  id: string;
  title: string;
  process_category: string;
}
interface CompanyHit {
  kind: 'company';
  id: string;
  name: string;
}
type Hit = SopHit | CompanyHit;

/** Global Cmd/Ctrl+K search over real SOPs and insurance companies — not a
 * mock command list. Results come straight from the existing tables the
 * rest of the admin portal already reads from. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setHits([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const [{ data: docs }, { data: companies }] = await Promise.all([
        supabase
          .from('sop_documents')
          .select('id, title, process_category')
          .ilike('title', `%${q}%`)
          .limit(6),
        supabase
          .from('insurance_companies')
          .select('id, name')
          .ilike('name', `%${q}%`)
          .limit(4),
      ]);
      const sopHits: Hit[] = (docs ?? []).map((d) => ({ kind: 'sop', id: d.id, title: d.title, process_category: d.process_category }));
      const companyHits: Hit[] = (companies ?? []).map((c) => ({ kind: 'company', id: c.id, name: c.name }));
      setHits([...sopHits, ...companyHits]);
      setActiveIndex(0);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  function select(hit: Hit) {
    onClose();
    if (hit.kind === 'sop') navigate(`/admin/review/${hit.id}`);
    else navigate('/admin/companies');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && hits[activeIndex]) { e.preventDefault(); select(hits[activeIndex]); }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div
        className="w-full max-w-xl bg-[#0D111B] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08]">
          <Search className="w-5 h-5 text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search SOPs, carriers..."
            className="flex-1 bg-transparent text-base text-slate-100 placeholder:text-slate-600 outline-none"
            aria-label="Search SOPs and insurance companies"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-500 animate-spin flex-shrink-0" />}
          <kbd className="text-xs font-mono text-slate-500 border border-white/10 rounded px-1.5 py-0.5 flex-shrink-0">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {query.trim() === '' ? (
            <p className="px-5 py-7 text-sm text-slate-600 text-center">Type to search SOPs or insurance companies</p>
          ) : !loading && hits.length === 0 ? (
            <p className="px-5 py-7 text-sm text-slate-600 text-center">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.kind}-${hit.id}`}
                onClick={() => select(hit)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${
                  i === activeIndex ? 'bg-white/[0.06]' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                  {hit.kind === 'sop' ? (
                    <FileText className="w-4 h-4 text-brand-400" />
                  ) : (
                    <Building2 className="w-4 h-4 text-sky-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base text-slate-100 truncate">{hit.kind === 'sop' ? hit.title : hit.name}</p>
                  {hit.kind === 'sop' && <p className="text-xs text-slate-500 truncate">{hit.process_category}</p>}
                </div>
                {i === activeIndex && <CornerDownLeft className="w-4 h-4 text-slate-600 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
