import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Inbox } from 'lucide-react';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-slate-500 text-sm py-10 justify-center animate-pulse">
      <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <p className="text-base font-medium text-slate-300">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1.5 max-w-sm">{description}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      {message}
    </div>
  );
}
