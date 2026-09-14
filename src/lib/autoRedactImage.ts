import type { DetectedRegion } from './detectSensitiveRegions';

export interface AutoRedactResult {
  /** The original image, with a pixelated mosaic baked over every detected
   *  region - unchanged (same as the input) if nothing was found. */
  redactedDataUrl: string;
  /** What was found/redacted, for the "3 items auto-redacted" summary UI. */
  regions: DetectedRegion[];
}

/**
 * True pixelation/mosaic redaction of one region, baked directly into the
 * given canvas context: draws the region at a tiny size (averaging many
 * source pixels into each one) then draws that tiny result back up with
 * smoothing off. Unlike Gaussian blur, this genuinely destroys the
 * underlying detail - there's no way to mathematically reverse an
 * averaging step, which is why real redaction tools use pixelation
 * instead of blur. Shared by the automatic upload-time pass below and the
 * interactive ImageRedactor editor, so both apply the exact same mosaic.
 */
export function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  naturalW: number,
  naturalH: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (width <= 0 || height <= 0) return;
  // Clamp to the image bounds — drawImage throws if the source rect falls
  // outside the source image (a box near an edge, after padding, can).
  const sx = Math.max(0, x);
  const sy = Math.max(0, y);
  const sw = Math.min(naturalW, x + width) - sx;
  const sh = Math.min(naturalH, y + height) - sy;
  if (sw <= 0 || sh <= 0) return;

  const blockSize = Math.max(8, Math.min(sw, sh) / 4);
  const smallW = Math.max(1, Math.round(sw / blockSize));
  const smallH = Math.max(1, Math.round(sh / blockSize));

  const small = document.createElement('canvas');
  small.width = smallW;
  small.height = smallH;
  const smallCtx = small.getContext('2d');
  if (!smallCtx) return;
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.drawImage(source, sx, sy, sw, sh, 0, 0, smallW, smallH);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, smallW, smallH, sx, sy, sw, sh);
  ctx.imageSmoothingEnabled = true;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for scanning.'));
    img.src = dataUrl;
  });
}

/**
 * Automatic scan + redact for one screenshot: OCR it, detect likely
 * sensitive insurance/customer fields (see detectSensitiveRegions), and
 * bake a pixelated mosaic over every one of them — no admin click
 * required. Runs the moment a screenshot comes out of an upload (see
 * AdminUpload), so by the time an admin looks at it, only the actual
 * sensitive spots are already hidden — never the whole image, just the
 * detected region plus a few px of padding so text edges don't peek out
 * at the box boundary.
 *
 * If OCR fails (e.g. a corrupt image) this fails open to the *original*
 * image with zero regions rather than throwing — the admin still sees
 * and can review it, same as before this existed, instead of the upload
 * silently breaking.
 */
export async function autoRedactImage(dataUrl: string): Promise<AutoRedactResult> {
  const [Tesseract, { detectSensitiveRegions }, img] = await Promise.all([
    import('tesseract.js'),
    import('./detectSensitiveRegions'),
    loadImage(dataUrl),
  ]);

  let regions: DetectedRegion[] = [];
  try {
    const worker = await Tesseract.createWorker('eng');
    // { blocks: true } is required — without it, data.blocks comes back
    // null and word-level bounding boxes (which detection is built from)
    // simply aren't computed.
    const { data } = await worker.recognize(dataUrl, {}, { blocks: true });
    await worker.terminate();
    const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    regions = detectSensitiveRegions(lines);
  } catch (err) {
    console.error('Automatic OCR scan failed for a screenshot:', err);
  }

  if (regions.length === 0) {
    return { redactedDataUrl: dataUrl, regions };
  }

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { redactedDataUrl: dataUrl, regions: [] };
  ctx.drawImage(img, 0, 0);

  const pad = 3;
  for (const r of regions) {
    pixelateRegion(ctx, img, img.naturalWidth, img.naturalHeight, r.x0 - pad, r.y0 - pad, r.x1 - r.x0 + pad * 2, r.y1 - r.y0 + pad * 2);
  }

  return { redactedDataUrl: canvas.toDataURL('image/png'), regions };
}
