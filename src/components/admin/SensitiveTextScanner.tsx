import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Eraser } from 'lucide-react';
import { scanTextForSensitiveInfo, type TextMatch } from '@/lib/detectSensitiveRegions';

interface Props {
  /** The editable SOP text to scan - same string the caller's textarea is bound to. */
  content: string;
  /** Called with the redacted text when "Redact All" is used. */
  onChange: (next: string) => void;
}

/**
 * Pairs with detectSensitiveRegions' plain-text scanner: lets an admin check
 * an SOP's actual text (not just its screenshots) for real customer/claim
 * data before publishing, and redact it in one click. Findings are always
 * shown for review first - nothing is changed until "Redact All" is
 * pressed, same review-before-apply spirit as the image redactor.
 */
export function SensitiveTextScanner({ content, onChange }: Props) {
  const [matches, setMatches] = useState<TextMatch[] | null>(null);

  // `matches` holds character OFFSETS into `content` as of the last scan.
  // If the admin keeps typing after scanning (the textarea isn't locked),
  // those offsets go stale — clicking "Redact All" would then slice/insert
  // at the wrong position in the NEW text, corrupting it instead of
  // redacting the actual sensitive text. Forcing a fresh scan on any edit
  // is simpler and safer than trying to re-map offsets through the edit.
  useEffect(() => {
    setMatches(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  function scan() {
    setMatches(scanTextForSensitiveInfo(content));
  }

  function redactAll() {
    if (!matches || matches.length === 0) return;
    let next = content;
    // Replace back-to-front so earlier offsets stay valid as the string shrinks/grows.
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      next = `${next.slice(0, m.start)}[REDACTED - ${m.reason}]${next.slice(m.end)}`;
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
          Scan Text for Sensitive Info
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
            No sensitive information detected in the text.
          </div>
        ) : (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
            <p className="text-xs text-amber-300 font-medium mb-1.5">
              {matches.length} possible sensitive item{matches.length !== 1 ? 's' : ''} found - review before publishing:
            </p>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {matches.map((m, i) => (
                <li key={i} className="text-xs text-amber-200/80 flex items-baseline gap-1.5">
                  <span className="text-amber-400 font-medium flex-shrink-0">{m.reason}:</span>
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
