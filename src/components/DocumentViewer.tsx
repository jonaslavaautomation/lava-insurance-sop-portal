import type { SopImage } from '@/lib/supabase';
import { splitIntoSteps } from '@/lib/splitIntoSteps';

/**
 * Renders plain-text SOP content as a numbered 1, 2, 3... list, same visual
 * language as a Tango-style step import (see StepsViewer) — so every SOP
 * reads the same way regardless of what format it started as or how it was
 * written (numbered list, bullet points, or plain paragraphs all end up
 * numbered here). See lib/splitIntoSteps.ts for how items are recognized.
 */
export function DocumentViewer({ content, images }: { content: string; images?: SopImage[] | null }) {
  const items = splitIntoSteps(content) ?? [];

  if (items.length === 0 && (!images || images.length === 0)) {
    return <p className="text-sm text-slate-400">No content.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((text, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </div>
          <p className="flex-1 text-sm text-slate-700 leading-relaxed whitespace-pre-line pt-0.5">{text}</p>
        </div>
      ))}

      {images && images.length > 0 && (
        <div className="pt-2 space-y-3">
          {images.map((img, i) => (
            <img
              key={i}
              src={img.dataUrl}
              alt={img.page ? `Page ${img.page} image` : 'Document image'}
              loading="lazy"
              className="w-full rounded-lg border border-slate-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}
