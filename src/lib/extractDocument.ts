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

/**
 * Extracts plain text (and any embedded photos) from an uploaded SOP file,
 * whatever format it came in — PDF, Word (.docx), or plain text/markdown.
 * This is what lets SOPs from any source end up looking the same once
 * published: everything is normalized before it's stored, and the VA
 * portal renders it the same way regardless of where it came from.
 */
export async function extractTextFromFile(file: File): Promise<ExtractedDocument> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  let result: ExtractedDocument;
  if (ext === 'pdf') result = await extractPdf(file);
  else if (ext === 'docx') result = await extractDocx(file);
  else if (ext === 'doc') {
    throw new Error(
      'Legacy .doc files aren’t supported — open it in Word and save as .docx, then upload that.'
    );
  } else {
    // .txt, .md, and anything else: treat as plain text, no images.
    result = { text: await file.text(), images: [] };
  }

  const steps = detectNumberedSteps(result.text, result.images);
  if (steps) return { text: result.text, images: [], steps };
  return result;
}

/**
 * Recognizes a document that's really a step-by-step walkthrough — numbered
 * markers ("1: Do this") or bullet points ("• Do this"), each usually
 * followed by its own screenshot — rather than an ordinary prose document.
 * When it matches, folds text + images into the same per-step shape used
 * for a direct Tango import (one image per item, in order), so it renders
 * with the numbered-walkthrough viewer instead of being squeezed into
 * paragraphs. Plain prose with no list structure is left as-is here — it
 * still gets numbered for display, just at render time (see
 * DocumentViewer), since there's no reliable way to say which image goes
 * with which paragraph without an explicit list to anchor on.
 */
function detectNumberedSteps(text: string, images: ExtractedImage[]): SopStep[] | null {
  const titles = splitIntoListItems(text);
  if (!titles || titles.length < 3) return null;

  return titles.map((title, i) => ({
    stepIndex: i,
    title,
    description: '',
    imageUrl: images[i]?.dataUrl ?? null,
    sourceUrl: null,
  }));
}

async function extractPdf(file: File): Promise<ExtractedDocument> {
  // Dynamically imported: pdfjs-dist is large (~1MB+) and VAs never need
  // it — no reason to make every visitor download it up front.
  const [pdfjsLib, { default: pdfjsWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  const images: ExtractedImage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const content = await page.getTextContent();
    const text = reconstructLayout(content.items);
    if (text) pages.push(text);

    try {
      const pageImages = await extractPdfPageImages(pdfjsLib, page, pageNum);
      images.push(...pageImages);
    } catch {
      // A page's images failing to extract shouldn't block the rest of the
      // document — the text for this SOP still comes through fine.
    }
  }

  return { text: pages.join('\n\n'), images };
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

async function extractDocx(file: File): Promise<ExtractedDocument> {
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
