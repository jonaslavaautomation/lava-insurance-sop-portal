import type { SopImage } from '@/lib/supabase';
import { splitIntoSteps } from '@/lib/splitIntoSteps';
import { StepImage } from '@/components/StepsViewer';

/**
 * Renders plain-text SOP content as a numbered 1, 2, 3... walkthrough, same
 * visual language as a Tango-style step import (see StepsViewer) — so every
 * SOP reads the same way regardless of what format it started as or how it
 * was written (numbered list, bullet points, or plain paragraphs all end up
 * numbered here). See lib/splitIntoSteps.ts for how items are recognized.
 *
 * Any images extracted from the source file are paired one-to-one with
 * items in order — the first photo appears directly under the first step,
 * the second under the second, and so on — instead of being dumped in a
 * block at the end. If there are more images than steps, the leftovers
 * still show up after the last step rather than being dropped.
 */
export function DocumentViewer({ content, images }: { content: string; images?: SopImage[] | null }) {
  const items = splitIntoSteps(content) ?? [];
  const imageList = images ?? [];

  if (items.length === 0 && imageList.length === 0) {
    return <p className="text-sm text-slate-400">No content.</p>;
  }

  const leftoverImages = imageList.slice(items.length);

  return (
    <div className="space-y-6">
      {items.map((text, i) => {
        const image = imageList[i];
        return (
          <div key={i} className="flex gap-4">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{text}</p>
              {image && (
                <div className="mt-3">
                  <StepImage src={image.dataUrl} alt={`Step ${i + 1} image`} />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {leftoverImages.length > 0 && (
        <div className="pt-2 space-y-3">
          {leftoverImages.map((img, i) => (
            <StepImage key={i} src={img.dataUrl} alt={img.page ? `Page ${img.page} image` : 'Document image'} />
          ))}
        </div>
      )}
    </div>
  );
}
