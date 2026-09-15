import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Eraser } from 'lucide-react';
import { scanTextForSensitiveInfo, type TextMatch } from '@/lib/detectSensitiveRegions';
import type { SopStep } from '@/lib/supabase';

interface Props {
  steps: SopStep[];
  onChange: (next: SopStep[]) => void;
}

interface StepMatch extends TextMatch {
  stepIndex: number;
  field: 'title' | 'description';
}

/**
 * Same purpose as SensitiveTextScanner, for the numbered-steps upload path.
 * That component scans one flat string; a step-by-step SOP has no single
 * string to scan (title/description live per step) and a plain-text upload
 * never reaches this path at all — so before this existed, a "Step N:"
 * PDF/Word upload got its screenshots auto-scanned but its actual step text
 * got NO sensitive-info check at all, even though that's exactly where an
 * admin is most likely to type a real customer name/number into an example.
 * Scans every step's title + description individually (so matches can be
 * redacted back into the right field) and aggregates the results into one
 * review list, same review-before-apply UX as the flat-text version.
 */
export function StepsSensitiveTextScanner({ steps, onChange }: Props) {
  const [matches, setMatches] = useState<StepMatch[] | null>(null);

  // Same reasoning as SensitiveTextScanner: `matches` holds offsets into
  // each step's title/description as of the last scan — force a fresh
  // scan if the steps change under us (e.g. a redaction was just applied,
  // or a screenshot re-scan updated something) instead of risking a
  // "Redact All" that slices the wrong position.
  useEffect(() => {
    setMatches(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  function scan() {
    const found: StepMatch[] = [];
    steps.forEach((step, stepIndex) => {
      for (const m of scanTextForSensitiveInfo(step.title)) found.push({ ...m, stepIndex, field: 'title' });
      for (const m of scanTextForSensitiveInfo(step.description)) found.push({ ...m, stepIndex, field: 'description' });
    });
    setMatches(found);
  }

  function redactAll() {
    if (!matches || matches.length === 0) return;
    const next = steps.map((s) => ({ ...s }));
    // Group by (step, field) and replace back-to-front within each field so
    // earlier offsets in that same string stay valid as it shrinks/grows.
    const byField = new Map<string, StepMatch[]>();
    for (const m of matches) {
      const key = `${m.stepIndex}:${m.field}`;
      if (!byField.has(key)) byField.set(key, []);
      byField.get(key)!.push(m);
    }
    for (const [key, fieldMatches] of byField) {
      const [stepIndexStr, field] = key.split(':') as [string, 'title' | 'description'];
      const stepIndex = Number(stepIndexStr);
      let text = next[stepIndex][field];
      const sorted = [...fieldMatches].sort((a, b) => b.start - a.start);
      for (const m of sorted) {
        text = `${text.slice(0, m.start)}[REDACTED - ${m.reason}]${text.slice(m.end)}`;
      }
      next[stepIndex] = { ...next[stepIndex], [field]: text };
    }
    onChange(next);
    setMatches(null);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={scan}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-colors"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Scan Step Text for Sensitive Info
        </button>
        {matches !== null && matches.length > 0 && (
          <button
            type="button"
            onClick={redactAll}
            className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" />
            Redact All ({matches.length})
          </button>
        )}
      </div>

      {matches !== null && (
        matches.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
            No sensitive information detected in the step text.
          </div>
        ) : (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
            <p className="text-xs text-amber-300 font-medium mb-1.5">
              {matches.length} possible sensitive item{matches.length !== 1 ? 's' : ''} found across the steps - review before publishing:
            </p>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {matches.map((m, i) => (
                <li key={i} className="text-xs text-amber-200/80 flex items-baseline gap-1.5">
                  <span className="text-amber-400 font-medium flex-shrink-0">Step {m.stepIndex + 1} · {m.reason}:</span>
                  <span className="truncate font-mono">&ldquo;{m.text}&rdquo;</span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
