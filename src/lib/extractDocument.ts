import type { SopStep } from '@/lib/supabase';
import { splitIntoListItems } from '@/lib/splitIntoSteps';

export interface ExtractedImage {
  dataUrl: string;
  page?: number;
}

export interface ExtractedDocument {
  text: string;
  images: ExtractedImage[];
  /** Present when the content looks like a numbered walkthrough (e.g. a
   *  Tango-exported PDF) — one screenshot per step, same shape/viewer as a
   *  direct Tango import. `images` is empty in that case; the images are
   *  folded into `steps` instead. */
  steps?: SopStep[];
}

/** Text and images grouped by source page (PDF) — or a single "page"
 *  standing in for the whole document (Word/plain text, which have no real
 *  page concept). Used so each page's own images can be matched up with
 *  that same page's own text instead of naively pairing image N with the
 *  Nth line item across the whole document — a multi-page SOP commonly has
 *  one summary screenshot at the end of each page/section, not one
 *  screenshot per individual line. */
interface PageBundle {
  text: string;
  images: ExtractedImage[];
}

/**
 * Extracts plain text (and any embedded photos) from an uploaded SOP file,
 * whatever format it came in — PDF, Word (.docx), or plain text/markdown.
 * This is what lets SOPs from any source end up looking the same once
 * published: everything is normalized before it's stored, and the VA
 * portal renders it the same way regardless of where it came from.
 */
export async function extractTextFromFile(file: File): Promise<ExtractedDocument> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  let pageBundles: PageBundle[];
  if (ext === 'pdf') pageBundles = await extractPdfPages(file);
  else if (ext === 'docx') pageBundles = [await extractDocxPage(file)];
  else if (ext === 'doc') {
    throw new Error(
      'Legacy .doc files aren’t supported — open it in Word and save as .docx, then upload that.'
    );
  } else {
    // .txt, .md, and anything else: treat as plain text, no images.
    pageBundles = [{ text: await file.text(), images: [] }];
  }

  const text = pageBundles.map((p) => p.text).join('\n\n');
  const images = pageBundles.flatMap((p) => p.images);

  const steps = detectNumberedSteps(pageBundles);
  if (steps) return { text, images: [], steps };
  return { text, images };
}

/**
 * Recognizes a document that's really a step-by-step walkthrough — numbered
 * markers ("1: Do this", "Step 1: Do this") and/or bullet points
 * ("• Do this"), mixed however the source document actually uses them —
 * rather than an ordinary prose document. When it matches, folds text +
 * images into the same per-step shape used for a direct Tango import, so it
 * renders with the numbered-walkthrough viewer instead of being squeezed
 * into paragraphs.
 *
 * Images are matched to items page-by-page, not by a single global index:
 * each page's own images are attached to the tail end of that same page's
 * own items (where a summary screenshot typically sits — after the
 * instructions it illustrates, not smeared across the very first few
 * items). A page with more images than items, or vice versa, just leaves
 * the extras unmatched (no image, or dropped to the page's last item) —
 * there's no way to be more precise than that without much deeper layout
 * analysis, and this is still far closer than a flat 1-to-1 guess.
 */
function detectNumberedSteps(pageBundles: PageBundle[]): SopStep[] | null {
  const fullText = pageBundles.map((p) => p.text).join('\n\n');
  const titles = splitIntoListItems(fullText);
  if (!titles || titles.length < 3) return null;

  // How many of the final items came from each page, by re-running the same
  // split against the text accumulated through that page. Small documents
  // (a handful of pages), so re-splitting a few extra times is cheap.
  let cumulativeText = '';
  let prevCount = 0;
  const imageAtItemIndex = new Map<number, ExtractedImage>();

  for (const { text: pageText, images: pageImages } of pageBundles) {
    cumulativeText += (cumulativeText ? '\n\n' : '') + pageText;
    const count = splitIntoListItems(cumulativeText)?.length ?? prevCount;

    // Place this page's images at the end of its own item range, working
    // backwards so several images on one page stack correctly instead of
    // overwriting the same slot.
    let slot = count - 1;
    for (let k = pageImages.length - 1; k >= 0 && slot >= prevCount; k--, slot--) {
      imageAtItemIndex.set(slot, pageImages[k]);
    }
    prevCount = count;
  }

  return titles.map((title, i) => ({
    stepIndex: i,
    title,
    description: '',
    imageUrl: imageAtItemIndex.get(i)?.dataUrl ?? null,
    sourceUrl: null,
  }));
}

async function extractPdfPages(file: File): Promise<PageBundle[]> {
  // Dynamically imported: pdfjs-dist is large (~1MB+) and VAs never need
  // it — no reason to make every visitor download it up front.
  const [pdfjsLib, { default: pdfjsWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pageBundles: PageBundle[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const content = await page.getTextContent();
    const text = reconstructLayout(content.items);

    let images: ExtractedImage[] = [];
    try {
      images = await extractPdfPageImages(pdfjsLib, page, pageNum);
    } catch {
      // A page's images failing to extract shouldn't block the rest of the
      // document — the text for this SOP still comes through fine.
    }

    pageBundles.push({ text, images });
  }

  return pageBundles;
}

async function extractPdfPageImages(
  pdfjsLib: typeof import('pdfjs-dist'),
  page: import('pdfjs-dist').PDFPageProxy,
  pageNum: number
): Promise<ExtractedImage[]> {
  const opList = await page.getOperatorList();

  const objIds: string[] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === pdfjsLib.OPS.paintImageXObject) {
      objIds.push(opList.argsArray[i][0]);
    }
  }
  if (objIds.length === 0) return [];

  // Rendering the page is what actually decodes images into page.objs —
  // getOperatorList() alone only lists *that* images are painted, not
  // their pixel data.
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const images: ExtractedImage[] = [];
  for (const objId of objIds) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = (page.objs as any).get(objId);
      const bitmap: ImageBitmap | undefined =
        obj instanceof ImageBitmap ? obj : obj?.bitmap instanceof ImageBitmap ? obj.bitmap : undefined;
      if (!bitmap) continue;
      // Skip tiny images (icons, bullets, decorative rules) — not real photos.
      if (bitmap.width < 40 || bitmap.height < 40) continue;

      const out = document.createElement('canvas');
      out.width = bitmap.width;
      out.height = bitmap.height;
      const outCtx = out.getContext('2d');
      if (!outCtx) continue;
      outCtx.drawImage(bitmap, 0, 0);
      images.push({ dataUrl: out.toDataURL('image/png'), page: pageNum });
    } catch {
      // Some image ops reference masks/patterns rather than real photos —
      // just skip whatever doesn't resolve to a plain bitmap.
    }
  }
  return images;
}

interface PositionedTextItem {
  str: string;
  y: number;
}

/**
 * PDFs have no concept of paragraphs — just positioned glyphs — so
 * getTextContent() alone would return everything as one flat line. This
 * groups items into lines by vertical position, then uses the gap between
 * lines (versus the page's typical single-line spacing) to tell an actual
 * paragraph break from a line that just wrapped.
 */
function reconstructLayout(items: unknown[]): string {
  const positioned: PositionedTextItem[] = items
    .filter((item): item is { str: string; transform: number[] } => {
      const it = item as Record<string, unknown>;
      return typeof it.str === 'string' && Array.isArray(it.transform);
    })
    .map((item) => ({ str: item.str, y: item.transform[5] }));

  if (positioned.length === 0) return '';

  // Group items into lines: consecutive items with (near-)identical y.
  const lines: { text: string; y: number }[] = [];
  for (const item of positioned) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - item.y) < 2) {
      current.text += item.str;
    } else {
      lines.push({ text: item.str, y: item.y });
    }
  }

  const trimmedLines = lines.map((l) => ({ ...l, text: l.text.trim() })).filter((l) => l.text);
  if (trimmedLines.length === 0) return '';

  // Typical single-line gap = the most common gap between consecutive lines.
  const gaps = trimmedLines.slice(1).map((l, i) => Math.abs(trimmedLines[i].y - l.y));
  const typicalGap = mode(gaps) || 12;

  let out = trimmedLines[0].text;
  for (let i = 1; i < trimmedLines.length; i++) {
    const gap = gaps[i - 1];
    // A gap noticeably bigger than normal line spacing reads as a new
    // paragraph; a normal gap is just the previous line wrapping.
    out += gap > typicalGap * 1.4 ? '\n\n' : ' ';
    out += trimmedLines[i].text;
  }
  return out;
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const rounded = values.map((v) => Math.round(v));
  const counts = new Map<number, number>();
  for (const v of rounded) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = rounded[0];
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

async function extractDocxPage(file: File): Promise<PageBundle> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const images: ExtractedImage[] = [];

  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64');
        images.push({ dataUrl: `data:${image.contentType};base64,${base64}` });
        // The data URL is discarded from the HTML output immediately after
        // (see htmlToBlockText) — we only used convertToHtml to get at this
        // callback in the first place, so the src content itself is moot.
        return { src: '' };
      }),
    }
  );

  return { text: htmlToBlockText(result.value), images };
}

/** Converts mammoth's output HTML to plain text while keeping paragraph/heading breaks. */
function htmlToBlockText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '$&\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
