import type { SopStep } from '@/lib/supabase';
import { splitIntoListItems, splitOnStepHeadings, splitStepChunk } from '@/lib/splitIntoSteps';

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
 * Recognizes a document that's really a step-by-step walkthrough and folds
 * text + images into the same per-step shape used for a direct Tango
 * import, so it renders with the numbered-walkthrough viewer instead of
 * being squeezed into paragraphs. Two shapes are recognized:
 *
 *  - A handful of named "Step N" sections, each with its own body text
 *    (which may itself contain a nested numbered/bulleted sub-list — kept
 *    intact as that step's description, not flattened into more steps) —
 *    see splitOnStepHeadings. This is preferred when present: it's what
 *    keeps "Step 1: Go to the home page / 1. Click X / 2. Click Y" as ONE
 *    step with two sub-instructions, not three separate steps.
 *  - A flat numbered/bulleted list with no "Step N" headings — every
 *    marker is its own step, title only, same as before.
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

  const stepChunks = splitOnStepHeadings(fullText);
  const usingStepHeadings = !!stepChunks;
  const items = stepChunks ?? splitIntoListItems(fullText);
  if (!items) return null;

  const split = usingStepHeadings ? splitOnStepHeadings : splitIntoListItems;

  // How many of the final items came from each page, by re-running the same
  // split against the text accumulated through that page. Small documents
  // (a handful of pages), so re-splitting a few extra times is cheap.
  //
  // Both splitters need a minimum amount of accumulated text before they
  // recognize anything at all (splitOnStepHeadings needs >=2 "Step N"
  // headings; splitIntoListItems needs >=3 markers) — so split(cumulative)
  // returns null for however many early pages it takes to cross that
  // threshold. Their images can't just be dropped for those pages (that
  // silently loses screenshots from any doc where the threshold isn't
  // crossed on page 1) - they're held in `pendingImages` and folded into
  // whichever page's images finally cross the threshold, so nothing gets
  // discarded, it just becomes as imprecisely-placed as this heuristic
  // already accepts elsewhere (see the multi-heading-per-page comment
  // below).
  let cumulativeText = '';
  let prevCount = 0;
  const imageAtItemIndex = new Map<number, ExtractedImage>();
  let pendingImages: ExtractedImage[] = [];

  for (const { text: pageText, images: pageImages } of pageBundles) {
    cumulativeText += (cumulativeText ? '\n\n' : '') + pageText;
    const splitResult = split(cumulativeText);
    if (!splitResult) {
      pendingImages.push(...pageImages);
      continue;
    }
    const count = splitResult.length;
    const imagesThisRound = pendingImages.length > 0 ? [...pendingImages, ...pageImages] : pageImages;
    pendingImages = [];

    if (usingStepHeadings) {
      // Step headings (unlike a flat numbered list) commonly cluster
      // several-to-a-page while a step's screenshot doesn't land until a
      // later page — the flat-list heuristic below (dump everything at the
      // page's tail item) would attach an early page's image to whatever
      // step happens to be LAST introduced on that page, which is wrong
      // when that page introduced more than one new step. Instead: give
      // each new step introduced on this page a shot at one of this page's
      // images in order (an image sharing a page with a step's own heading
      // usually illustrates THAT step), then let any leftover images on the
      // page — including a page that introduces no new step at all, i.e. a
      // continuation page — fall to whatever step is still open at the end
      // of the page, first image wins if there's more than one to choose
      // from (one step can only carry a single screenshot).
      let imgIdx = 0;
      for (let s = prevCount; s < count && imgIdx < imagesThisRound.length; s++, imgIdx++) {
        imageAtItemIndex.set(s, imagesThisRound[imgIdx]);
      }
      const openStep = count - 1;
      for (; imgIdx < imagesThisRound.length && openStep >= 0; imgIdx++) {
        if (!imageAtItemIndex.has(openStep)) imageAtItemIndex.set(openStep, imagesThisRound[imgIdx]);
      }
    } else {
      // Place this page's images at the end of its own item range, working
      // backwards so several images on one page stack correctly instead of
      // overwriting the same slot.
      let slot = count - 1;
      for (let k = imagesThisRound.length - 1; k >= 0 && slot >= prevCount; k--, slot--) {
        imageAtItemIndex.set(slot, imagesThisRound[k]);
      }
    }
    prevCount = count;
  }

  return items.map((item, i) => {
    const { title, description } = usingStepHeadings ? splitStepChunk(item) : { title: item, description: '' };
    return {
      stepIndex: i,
      title,
      description,
      imageUrl: imageAtItemIndex.get(i)?.dataUrl ?? null,
      sourceUrl: null,
    };
  });
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
    const text = stripRunningFooterNoise(reconstructLayout(content.items));

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

type Matrix2D = [number, number, number, number, number, number];
const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

/** Composes PDF transform `m` (applied first) with the current CTM `t` —
 *  same order as the `cm` operator's own semantics. */
function composeMatrix(m: Matrix2D, t: Matrix2D): Matrix2D {
  return [
    m[0] * t[0] + m[1] * t[2],
    m[0] * t[1] + m[1] * t[3],
    m[2] * t[0] + m[3] * t[2],
    m[2] * t[1] + m[3] * t[3],
    m[4] * t[0] + m[5] * t[2] + t[4],
    m[4] * t[1] + m[5] * t[3] + t[5],
  ];
}

function applyMatrix(m: Matrix2D, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

interface PageRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Every `paintImageXObject` call paints into the unit square [0,1]x[0,1] as
 * positioned by the current transform (CTM) at that point in the operator
 * list — walking save/restore/transform ops the same way a PDF renderer
 * does recovers each image's actual rectangle on the page, in the same
 * units as every other image's, regardless of scale.
 */
function computeImagePageRects(pdfjsLib: typeof import('pdfjs-dist'), opList: { fnArray: number[]; argsArray: unknown[] }): Map<string, PageRect> {
  const rects = new Map<string, PageRect>();
  let ctm: Matrix2D = IDENTITY_MATRIX;
  const stack: Matrix2D[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === pdfjsLib.OPS.save) {
      stack.push(ctm);
    } else if (fn === pdfjsLib.OPS.restore) {
      ctm = stack.pop() ?? IDENTITY_MATRIX;
    } else if (fn === pdfjsLib.OPS.transform) {
      const m = opList.argsArray[i] as Matrix2D;
      ctm = composeMatrix(m, ctm);
    } else if (fn === pdfjsLib.OPS.paintImageXObject) {
      const objId = opList.argsArray[i] as unknown as string[];
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => applyMatrix(ctm, x, y));
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      rects.set(objId[0], { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }
  }
  return rects;
}

function rectArea(r: PageRect): number {
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
}

/** True if `inner` sits inside `outer` (with a little slack for rounding/
 *  anti-aliasing) and is meaningfully smaller — the literal geometry of a
 *  callout/highlight box drawn as its own image on top of a bigger
 *  screenshot, regardless of the callout's size, color, or how blank or
 *  content-filled either image's pixels are. */
function isNestedWithin(inner: PageRect, outer: PageRect): boolean {
  const slack = 2; // page-space units of tolerance
  const fits =
    inner.x0 >= outer.x0 - slack &&
    inner.y0 >= outer.y0 - slack &&
    inner.x1 <= outer.x1 + slack &&
    inner.y1 <= outer.y1 + slack;
  return fits && rectArea(inner) < rectArea(outer) * 0.6;
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

  const pageRects = computeImagePageRects(pdfjsLib, opList);
  // A callout/highlight box some SOP tools draw as its own image layered on
  // top of the real screenshot (e.g. a red rectangle pointing at one field)
  // is often well over the old 40x40 "tiny icon" pixel cutoff (up to
  // ~500x170px seen in the wild), so that size check alone doesn't catch
  // it. What's unambiguous regardless of the callout's size/color/content
  // is its PLACEMENT: it's painted entirely inside a bigger image's own
  // rectangle on the same page - the literal geometry of "on top of".
  const nestedObjIds = new Set(
    objIds.filter((id) => {
      const r = pageRects.get(id);
      if (!r) return false;
      return objIds.some((otherId) => {
        if (otherId === id) return false;
        const other = pageRects.get(otherId);
        return other ? isNestedWithin(r, other) : false;
      });
    })
  );

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
      if (nestedObjIds.has(objId)) continue;
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
// Some SOP-authoring tools stamp a running "How To <title> Step N of M"
// progress footer on every page. When that footer's line sits close enough
// (in the PDF's own vertical spacing) to the very next heading, reconstruct-
// Layout's gap-based paragraph-break heuristic doesn't insert a break
// between them - the footer and the next "Step N+1" heading end up glued
// onto one reconstructed line, e.g. "...How To Save New Submission in IMS
// Step 07 of 10 STEP 08 Select the Quote Type...". Since STEP_HEADING_RE
// (splitIntoSteps.ts) only recognizes a heading at the start of a line -
// deliberately, to avoid matching an incidental "step 2" inside ordinary
// prose - a heading stuck mid-line like this is invisible to it, and that
// whole step silently disappears into the previous one's description.
//
// "Step N of M" is a highly specific, unambiguous footer signature (real
// instructional text essentially never phrases itself that way), so it's
// safe to strip unconditionally rather than trying to make the general
// layout/paragraph-break heuristic itself aware of this one tool's footer
// convention. Removing it restores the paragraph break that was already
// correctly placed just BEFORE the footer, which is what lets the
// following heading correctly start its own line again.
const RUNNING_FOOTER_RE = /\bHow\s+To\b[^\n]*?\bStep\s+\d{1,3}\s+of\s+\d{1,3}\b[.,]?\s*/gi;

function stripRunningFooterNoise(text: string): string {
  return text.replace(RUNNING_FOOTER_RE, '');
}

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
