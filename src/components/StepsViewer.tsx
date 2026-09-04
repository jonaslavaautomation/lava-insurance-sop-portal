import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { SopStep } from '@/lib/supabase';

/** Strips the simple HTML Tango descriptions come wrapped in (e.g. <p>...</p>). */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function StepImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-4 py-6 justify-center">
        <ImageOff className="w-4 h-4" />
        Screenshot unavailable
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full rounded-lg border border-slate-200"
    />
  );
}

/**
 * Renders a numbered walkthrough (title + optional description + optional
 * screenshot per step) entirely inside the page — no redirect, no iframe to
 * another site. Used for SOPs imported from tools like Tango.
 */
export function StepsViewer({ steps }: { steps: SopStep[] }) {
  return (
    <div className="space-y-6">
      {steps.map((step, i) => {
        const description = step.description ? stripHtml(step.description) : '';
        return (
          <div key={step.stepIndex ?? i} className="flex gap-4">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{step.title}</p>
              {description && <p className="text-sm text-slate-600 mt-1">{description}</p>}
              {step.imageUrl && (
                <div className="mt-3">
                  <StepImage src={step.imageUrl} alt={step.title} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
