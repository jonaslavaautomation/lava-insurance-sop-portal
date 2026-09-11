import type { LucideIcon } from 'lucide-react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Sparkline } from './Sparkline';

export type TrendDirection = 'up' | 'down' | 'neutral';

/** Small colored delta indicator, e.g. "+2 this month". Never color-only —
 * always paired with an arrow/dash icon so it isn't communicated by hue alone. */
export function TrendBadge({ direction, label }: { direction: TrendDirection; label: string }) {
  const styles: Record<TrendDirection, string> = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-slate-500',
  };
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${styles[direction]}`}>
      <Icon className="w-4 h-4" />
      {label}
    </span>
  );
}

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: 'brand' | 'emerald' | 'cyan' | 'amber' | 'sky';
  trend?: { direction: TrendDirection; label: string };
  sparkline?: number[];
}

const ACCENTS: Record<NonNullable<KPICardProps['accent']>, { text: string; bg: string; line: string }> = {
  brand: { text: 'text-brand-400', bg: 'bg-brand-500/10', line: '#FB7189' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', line: '#10B981' },
  cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', line: '#06B6D4' },
  amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', line: '#F59E0B' },
  sky: { text: 'text-sky-400', bg: 'bg-sky-500/10', line: '#38BDF8' },
};

/** Enterprise-console stat tile — label, number, trend, optional inline
 * sparkline, sized for comfortable reading rather than maximum density. */
export function KPICard({ label, value, icon: Icon, accent = 'brand', trend, sparkline }: KPICardProps) {
  const a = ACCENTS[accent];
  return (
    <div className="bg-[#121723]/80 border border-white/[0.08] rounded-xl p-6 flex flex-col gap-3 min-w-0 min-h-[152px]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${a.bg}`}>
          <Icon className={`w-5 h-5 ${a.text}`} />
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-4xl font-bold text-slate-50 font-mono tabular-nums leading-none">{value}</span>
        {sparkline && sparkline.length > 1 && (
          <div className="w-20 h-9 flex-shrink-0">
            <Sparkline data={sparkline} color={a.line} />
          </div>
        )}
      </div>
      {trend && <TrendBadge direction={trend.direction} label={trend.label} />}
    </div>
  );
}
