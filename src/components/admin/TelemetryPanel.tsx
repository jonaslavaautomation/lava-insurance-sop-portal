export interface TelemetryEvent {
  id: string;
  timestamp: string;
  action: string;
  subject: string;
  tone: 'view' | 'like' | 'publish' | 'upload';
}

const TONE_DOT: Record<TelemetryEvent['tone'], string> = {
  view: 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]',
  like: 'bg-brand-bright shadow-[0_0_6px_rgba(255,42,95,0.7)]',
  publish: 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]',
  upload: 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.7)]',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

/** Real recent activity (views, likes, publishes, uploads) rendered as a
 * technical telemetry console rather than a chat-style feed. Never shows
 * who did it - just what happened - so it stays safe to show admins
 * without exposing other users' identities. */
export function TelemetryPanel({ events }: { events: TelemetryEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-600 text-center py-10">No recent activity yet.</p>;
  }
  return (
    <div className="space-y-4">
      {events.map((e) => (
        <div key={e.id} className="flex items-start gap-3">
          <span className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${TONE_DOT[e.tone]}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-300 leading-snug">
              {e.action} <span className="text-slate-500">&ldquo;{e.subject}&rdquo;</span>
            </p>
            <p className="text-xs font-mono text-slate-600 mt-1">{formatTime(e.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
