/**
 * Extracts plain text from an uploaded SOP file, whatever format it came
 * in — PDF, Word (.docx), or plain text/markdown. This is what lets SOPs
 * from any source end up looking the same once published: everything is
 * normalized to plain text before it's stored, and the VA portal renders
 * that text the same way regardless of where it came from.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') return extractPdfText(file);
  if (ext === 'docx') return extractDocxText(file);
  if (ext === 'doc') {
    throw new Error(
      'Legacy .doc files aren’t supported — open it in Word and save as .docx, then upload that.'
    );
  }
  // .txt, .md, and anything else: treat as plain text.
  return file.text();
}

async function extractPdfText(file: File): Promise<string> {
  // Dynamically imported: pdfjs-dist is large (~1MB+) and only VAs never
  // need it — no reason to make every visitor download it up front.
  const [pdfjsLib, { default: pdfjsWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = reconstructLayout(content.items);
    if (text) pages.push(text);
  }
  return pages.join('\n\n');
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

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}
