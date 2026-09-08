export interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  bbox: OcrBbox;
}

export interface OcrLine {
  words: OcrWord[];
}

export interface DetectedRegion extends OcrBbox {
  reason: string;
}

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
// VINs never contain I, O, or Q (to avoid confusion with 1/0) — 17 chars.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
const ZIP_PLUS4_RE = /^\d{5}-\d{4}$/;
const ZIP_RE = /^\d{5}$/;

/** word -> what it labels. Matched case-insensitively, punctuation stripped. */
const LABELS: { words: string[]; reason: string }[] = [
  { words: ['name'], reason: 'Name' },
  { words: ['insured'], reason: 'Insured name' },
  { words: ['customer'], reason: 'Customer name' },
  { words: ['client'], reason: 'Client name' },
  { words: ['policyholder'], reason: 'Policyholder name' },
  { words: ['agency'], reason: 'Agency' },
  { words: ['agent'], reason: 'Agent' },
  { words: ['policy'], reason: 'Policy number' },
  { words: ['account'], reason: 'Account number' },
  { words: ['address'], reason: 'Address' },
  { words: ['mailing'], reason: 'Mailing address' },
  { words: ['phone'], reason: 'Phone number' },
  { words: ['email'], reason: 'Email' },
  { words: ['vin'], reason: 'VIN' },
  { words: ['zip', 'zipcode'], reason: 'ZIP code' },
];

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

function matchLabel(word: string): string | null {
  const norm = normalize(word);
  if (!norm) return null;
  const hit = LABELS.find((l) => l.words.includes(norm));
  return hit ? hit.reason : null;
}

function union(boxes: OcrBbox[]): OcrBbox {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

function overlaps(a: OcrBbox, b: OcrBbox): boolean {
  return !(a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0);
}

/**
 * Best-effort scan of OCR'd text for likely PII, returning suggested
 * redaction boxes in image pixel coordinates. This is a convenience layer,
 * not a guarantee — it's shown to the admin as editable suggestions (see
 * ImageRedactor) that get reviewed before anything is published, not
 * applied blind. Two kinds of matches:
 *
 *  - Structured patterns that are reliably recognizable on their own:
 *    emails, VINs, ZIP+4, phone numbers (checked over short runs of
 *    adjacent words, since OCR sometimes splits a phone number into
 *    separate tokens).
 *  - Labeled fields ("Policy: ABC123", "Insured: Jane Doe") — text right
 *    after a recognized label word, up to the next label or end of line.
 *    This is how things with no fixed format (names, agency, address,
 *    policy numbers — every carrier's look different) get caught.
 *
 * A bare 5-digit number is only treated as a ZIP when the line also
 * mentions "zip" or "address" — otherwise a dollar amount or ID number
 * would constantly false-positive.
 */
export function detectSensitiveRegions(lines: OcrLine[]): DetectedRegion[] {
  const regions: DetectedRegion[] = [];

  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim().length > 0);

    for (const w of words) {
      const t = w.text.trim();
      if (EMAIL_RE.test(t)) regions.push({ ...w.bbox, reason: 'Email address' });
      else if (VIN_RE.test(t)) regions.push({ ...w.bbox, reason: 'VIN' });
      else if (ZIP_PLUS4_RE.test(t)) regions.push({ ...w.bbox, reason: 'ZIP code' });
    }

    // Phone numbers: OCR sometimes splits "(555) 123-4567" into 2-3 tokens.
    for (let i = 0; i < words.length; i++) {
      for (let span = 1; span <= 3 && i + span <= words.length; span++) {
        const group = words.slice(i, i + span);
        const joined = group.map((g) => g.text).join('');
        if (PHONE_RE.test(joined)) {
          regions.push({ ...union(group.map((g) => g.bbox)), reason: 'Phone number' });
        }
      }
    }

    // Labeled fields: redact the run of words after a label, stopping at
    // the next label or end of line.
    for (let i = 0; i < words.length; i++) {
      const reason = matchLabel(words[i].text);
      if (!reason) continue;
      const valueWords: OcrWord[] = [];
      for (let j = i + 1; j < words.length; j++) {
        if (matchLabel(words[j].text)) break;
        valueWords.push(words[j]);
      }
      if (valueWords.length > 0) {
        regions.push({ ...union(valueWords.map((w) => w.bbox)), reason });
      }
    }

    // Bare ZIP: only in a line that's clearly address-shaped.
    const hasZipContext = words.some((w) => ['zip', 'zipcode', 'address'].includes(normalize(w.text)));
    if (hasZipContext) {
      for (const w of words) {
        if (ZIP_RE.test(w.text.trim())) regions.push({ ...w.bbox, reason: 'ZIP code' });
      }
    }
  }

  return mergeOverlapping(regions);
}

/** Merges boxes that overlap so the same word doesn't get two stacked suggestions. */
function mergeOverlapping(regions: DetectedRegion[]): DetectedRegion[] {
  const merged: DetectedRegion[] = [];
  for (const r of regions) {
    const existing = merged.find((m) => overlaps(m, r));
    if (existing) {
      existing.x0 = Math.min(existing.x0, r.x0);
      existing.y0 = Math.min(existing.y0, r.y0);
      existing.x1 = Math.max(existing.x1, r.x1);
      existing.y1 = Math.max(existing.y1, r.y1);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}
