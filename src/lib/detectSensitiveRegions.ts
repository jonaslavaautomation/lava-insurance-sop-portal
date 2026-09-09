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
const SSN_RE = /^\d{3}-\d{2}-\d{4}$/;
const EIN_RE = /^\d{2}-\d{7}$/;

/**
 * Multi-word label phrases -> what they label. Matched case-insensitively
 * with punctuation stripped, longest phrase first (so "policy number"
 * matches as one label, not "policy" leaving "number" in the redacted
 * value). One reason can have several phrasings.
 */
const LABEL_PHRASES: { phrase: string[]; reason: string }[] = [
  // Identity
  { phrase: ['full', 'name'], reason: 'Full name' },
  { phrase: ['first', 'name'], reason: 'First name' },
  { phrase: ['last', 'name'], reason: 'Last name' },
  { phrase: ['insured', 'name'], reason: 'Insured name' },
  { phrase: ['insured'], reason: 'Insured name' },
  { phrase: ['customer', 'name'], reason: 'Customer name' },
  { phrase: ['customer'], reason: 'Customer name' },
  { phrase: ['client'], reason: 'Client name' },
  { phrase: ['policyholder'], reason: 'Policyholder name' },
  { phrase: ['name'], reason: 'Name' },
  { phrase: ['agency'], reason: 'Agency' },
  { phrase: ['agent'], reason: 'Agent' },
  { phrase: ['date', 'of', 'birth'], reason: 'Date of birth' },
  { phrase: ['birth', 'date'], reason: 'Date of birth' },
  { phrase: ['dob'], reason: 'Date of birth' },
  // Government / financial IDs
  { phrase: ['social', 'security', 'number'], reason: 'SSN' },
  { phrase: ['social', 'security'], reason: 'SSN' },
  { phrase: ['ssn'], reason: 'SSN' },
  { phrase: ['tax', 'id'], reason: 'Tax ID' },
  { phrase: ['ein'], reason: 'Tax ID' },
  { phrase: ['bank', 'account'], reason: 'Bank account' },
  { phrase: ['account', 'number'], reason: 'Account number' },
  { phrase: ['routing', 'number'], reason: 'Bank routing number' },
  { phrase: ['routing'], reason: 'Bank routing number' },
  { phrase: ['credit', 'card'], reason: 'Credit card' },
  { phrase: ['credit'], reason: 'Credit info' },
  { phrase: ['account'], reason: 'Account number' },
  // Policy / vehicle
  { phrase: ['policy', 'number'], reason: 'Policy number' },
  { phrase: ['policy', 'no'], reason: 'Policy number' },
  { phrase: ['policy'], reason: 'Policy number' },
  { phrase: ['vin'], reason: 'VIN' },
  { phrase: ['license', 'plate'], reason: 'License plate' },
  { phrase: ['plate'], reason: 'License plate' },
  { phrase: ['effective', 'date'], reason: 'Effective date' },
  { phrase: ['effective'], reason: 'Effective date' },
  { phrase: ['expiration', 'date'], reason: 'Expiration date' },
  { phrase: ['expiration'], reason: 'Expiration date' },
  { phrase: ['expiry'], reason: 'Expiration date' },
  // Contact / location
  { phrase: ['mailing', 'address'], reason: 'Mailing address' },
  { phrase: ['mailing'], reason: 'Mailing address' },
  { phrase: ['address'], reason: 'Address' },
  { phrase: ['zip', 'code'], reason: 'ZIP code' },
  { phrase: ['zip'], reason: 'ZIP code' },
  { phrase: ['zipcode'], reason: 'ZIP code' },
  { phrase: ['phone'], reason: 'Phone number' },
  { phrase: ['telephone'], reason: 'Phone number' },
  { phrase: ['email'], reason: 'Email' },
  // Claims
  { phrase: ['claim', 'number'], reason: 'Claim number' },
  { phrase: ['claim', 'no'], reason: 'Claim number' },
  { phrase: ['claim'], reason: 'Claim number' },
  { phrase: ['loss', 'details'], reason: 'Loss details' },
  { phrase: ['loss', 'description'], reason: 'Loss details' },
  { phrase: ['loss'], reason: 'Loss details' },
  { phrase: ['settlement', 'amount'], reason: 'Settlement amount' },
  { phrase: ['settlement'], reason: 'Settlement amount' },
  { phrase: ['adjuster', 'notes'], reason: 'Adjuster notes' },
  { phrase: ['adjuster'], reason: 'Adjuster notes' },
];

// Longest phrase first, so a 2-3 word label is tried before falling back to
// a shorter one that's a prefix of it (e.g. "policy number" before "policy").
const SORTED_LABELS = [...LABEL_PHRASES].sort((a, b) => b.phrase.length - a.phrase.length);

// Narrative fields that tend to run across more than one line — once the
// label is found, keep absorbing the following lines (up to a cap) instead
// of stopping at the end of the label's own line.
const MULTILINE_REASONS = new Set(['Loss details', 'Adjuster notes', 'Settlement amount']);
const MAX_CONTINUATION_LINES = 3;

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

/** Tries to match a label phrase starting at word index `start`. Returns the
 *  reason and how many words the label itself consumed, or null. */
function matchLabelAt(words: OcrWord[], start: number): { reason: string; length: number } | null {
  for (const { phrase, reason } of SORTED_LABELS) {
    if (start + phrase.length > words.length) continue;
    const matches = phrase.every((p, i) => normalize(words[start + i].text) === p);
    if (matches) return { reason, length: phrase.length };
  }
  return null;
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
 * Best-effort scan of OCR'd text for likely PII/PHI/financial info,
 * returning suggested redaction boxes in image pixel coordinates. This is a
 * convenience layer, not a guarantee — it's shown to the admin as editable
 * suggestions (see ImageRedactor) that get reviewed before anything is
 * published, not applied blind. Two kinds of matches:
 *
 *  - Structured patterns that are reliably recognizable on their own:
 *    emails, VINs, SSNs, Tax IDs (EIN), ZIP+4, phone numbers (checked over
 *    short runs of adjacent words, since OCR sometimes splits a phone
 *    number into separate tokens).
 *  - Labeled fields ("Policy #: ABC123", "Insured: Jane Doe", "SSN: ...")
 *    — text right after a recognized label, up to the next label or end of
 *    line. This is how things with no fixed format get caught: names,
 *    agency, address, policy/claim/account numbers, dates that are only
 *    sensitive in context (DOB, effective/expiration — a bare date isn't
 *    flagged on its own, there are too many harmless ones on a quote
 *    screen), license plates, bank/credit info, loss details, settlement
 *    amounts, adjuster notes.
 *
 * Narrative fields (loss details, adjuster notes, settlement amount) often
 * run across more than one line, so those continue absorbing the next
 * couple of lines until another label or a blank line — a deliberately
 * wide box here is the safer failure mode than under-redacting, but it
 * does mean a genuinely multi-column layout could get over-redacted next
 * to one of these; that's exactly what the review step is for.
 *
 * A bare 5-digit number is only treated as a ZIP when the line also
 * mentions "zip" or "address" — otherwise a dollar amount or ID number
 * would constantly false-positive.
 */
export function detectSensitiveRegions(lines: OcrLine[]): DetectedRegion[] {
  const regions: DetectedRegion[] = [];
  const lineWords = lines.map((l) => l.words.filter((w) => w.text.trim().length > 0));

  for (const words of lineWords) {
    for (const w of words) {
      const t = w.text.trim();
      if (EMAIL_RE.test(t)) regions.push({ ...w.bbox, reason: 'Email address' });
      else if (VIN_RE.test(t)) regions.push({ ...w.bbox, reason: 'VIN' });
      else if (SSN_RE.test(t)) regions.push({ ...w.bbox, reason: 'SSN' });
      else if (EIN_RE.test(t)) regions.push({ ...w.bbox, reason: 'Tax ID' });
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
  }

  // Labeled fields: redact the run of words after a label, stopping at the
  // next label or end of line (or, for narrative fields, continuing onto
  // the next few lines — see MULTILINE_REASONS).
  for (let li = 0; li < lineWords.length; li++) {
    const words = lineWords[li];
    for (let i = 0; i < words.length; i++) {
      const match = matchLabelAt(words, i);
      if (!match) continue;

      const valueWords: OcrWord[] = [];
      let j = i + match.length;
      for (; j < words.length; j++) {
        if (matchLabelAt(words, j)) break;
        valueWords.push(words[j]);
      }

      if (MULTILINE_REASONS.has(match.reason)) {
        let extraLines = 0;
        let nextLi = li + 1;
        while (nextLi < lineWords.length && extraLines < MAX_CONTINUATION_LINES) {
          const nextWords = lineWords[nextLi];
          if (nextWords.length === 0 || matchLabelAt(nextWords, 0)) break;
          valueWords.push(...nextWords);
          nextLi++;
          extraLines++;
        }
      }

      if (valueWords.length > 0) {
        regions.push({ ...union(valueWords.map((w) => w.bbox)), reason: match.reason });
      }
      i = j - 1; // resume scanning after the value words we just consumed
    }
  }

  // Bare ZIP: only in a line that's clearly address-shaped.
  for (const words of lineWords) {
    const hasZipContext = words.some((w) => ['zip', 'zipcode', 'address'].includes(normalize(w.text)));
    if (!hasZipContext) continue;
    for (const w of words) {
      if (ZIP_RE.test(w.text.trim())) regions.push({ ...w.bbox, reason: 'ZIP code' });
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
