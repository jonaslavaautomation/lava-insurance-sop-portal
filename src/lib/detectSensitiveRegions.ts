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

/** One sensitive match found in plain text — character offsets into the
 *  original string, so callers can slice/replace precisely. */
export interface TextMatch {
  start: number;
  end: number;
  text: string;
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
// 4 groups of 3-4 digits (with optional separators) - the shape a credit
// card number takes whether OCR'd as one token or split into groups, before
// the digit count + Luhn check below confirm it's actually one.
const DIGIT_GROUP_RE = /^[\d -]+$/;

/**
 * Luhn checksum (ISO/IEC 7812) — what every real credit/debit card number
 * satisfies. Checking this before flagging a bare 13-19 digit run as a card
 * number is what makes that detection safe to run with NO label nearby:
 * a random same-length number passes by chance only ~10% of the time, and
 * most naturally-occurring numbers in an SOP (policy #s, IDs, phone runs)
 * are shorter or don't validate, so this stays a high-precision signal.
 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * ABA routing-number checksum: banks compute this exact weighted sum (per
 * the Federal Reserve's routing number spec) so it's 0 mod 10 for every
 * real routing number. Same purpose as the Luhn check above — lets a bare
 * 9-digit run be flagged confidently without needing a "routing" label
 * next to it.
 */
function passesAbaRoutingChecksum(digits: string): boolean {
  if (digits.length !== 9) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (digits.charCodeAt(i) - 48) * w[i];
  return sum % 10 === 0;
}

function classifyDigitRun(raw: string): string | null {
  const digits = raw.replace(/[ -]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return 'Credit/debit card number';
  if (digits.length === 9 && passesAbaRoutingChecksum(digits)) return 'Bank routing number';
  return null;
}

/**
 * Multi-word label phrases -> what they label. Matched case-insensitively
 * with punctuation stripped, longest phrase first (so "policy number"
 * matches as one label, not "policy" leaving "number" in the redacted
 * value). One reason can have several phrasings. Grouped by the kind of
 * insurance document field they show up on (dec pages, ACORD forms, claims
 * notes, EFT/payment screens) so it's easy to see what's covered.
 */
const LABEL_PHRASES: { phrase: string[]; reason: string }[] = [
  // Identity
  { phrase: ['full', 'name'], reason: 'Full name' },
  { phrase: ['first', 'name'], reason: 'First name' },
  { phrase: ['last', 'name'], reason: 'Last name' },
  { phrase: ['insured', 'name'], reason: 'Insured name' },
  { phrase: ['named', 'insured'], reason: 'Insured name' },
  { phrase: ['insured'], reason: 'Insured name' },
  { phrase: ['co-insured'], reason: 'Co-insured name' },
  { phrase: ['co', 'insured'], reason: 'Co-insured name' },
  { phrase: ['additional', 'insured'], reason: 'Additional insured' },
  { phrase: ['customer', 'name'], reason: 'Customer name' },
  { phrase: ['customer'], reason: 'Customer name' },
  { phrase: ['client'], reason: 'Client name' },
  { phrase: ['policyholder'], reason: 'Policyholder name' },
  { phrase: ['beneficiary'], reason: 'Beneficiary name' },
  { phrase: ['mortgagee'], reason: 'Mortgagee' },
  { phrase: ['lienholder'], reason: 'Lienholder' },
  { phrase: ['employer'], reason: 'Employer' },
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
  { phrase: ['drivers', 'license'], reason: "Driver's license number" },
  { phrase: ['driver', 'license'], reason: "Driver's license number" },
  { phrase: ['dl', 'number'], reason: "Driver's license number" },
  { phrase: ['dl'], reason: "Driver's license number" },
  { phrase: ['passport', 'number'], reason: 'Passport number' },
  { phrase: ['passport'], reason: 'Passport number' },
  { phrase: ['medicare', 'number'], reason: 'Medicare ID' },
  { phrase: ['medicare', 'id'], reason: 'Medicare ID' },
  { phrase: ['member', 'id'], reason: 'Member ID' },
  { phrase: ['member', 'number'], reason: 'Member ID' },
  { phrase: ['group', 'number'], reason: 'Group number' },
  { phrase: ['group', 'id'], reason: 'Group number' },
  { phrase: ['bank', 'account'], reason: 'Bank account' },
  { phrase: ['account', 'number'], reason: 'Account number' },
  { phrase: ['routing', 'number'], reason: 'Bank routing number' },
  { phrase: ['routing'], reason: 'Bank routing number' },
  { phrase: ['credit', 'card'], reason: 'Credit card' },
  { phrase: ['debit', 'card'], reason: 'Debit card' },
  { phrase: ['card', 'number'], reason: 'Card number' },
  { phrase: ['cvv'], reason: 'Card security code' },
  { phrase: ['cvc'], reason: 'Card security code' },
  { phrase: ['security', 'code'], reason: 'Card security code' },
  { phrase: ['credit'], reason: 'Credit info' },
  { phrase: ['account'], reason: 'Account number' },
  // Policy / vehicle
  { phrase: ['policy', 'number'], reason: 'Policy number' },
  { phrase: ['policy', 'no'], reason: 'Policy number' },
  { phrase: ['policy'], reason: 'Policy number' },
  { phrase: ['naic', 'number'], reason: 'NAIC number' },
  { phrase: ['naic'], reason: 'NAIC number' },
  { phrase: ['producer', 'license'], reason: 'Producer license number' },
  { phrase: ['agent', 'license'], reason: 'Agent license number' },
  { phrase: ['license', 'number'], reason: 'License number' },
  { phrase: ['vin'], reason: 'VIN' },
  { phrase: ['vehicle', 'identification'], reason: 'VIN' },
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
  { phrase: ['cell'], reason: 'Phone number' },
  { phrase: ['email'], reason: 'Email' },
  // Claims
  { phrase: ['claim', 'number'], reason: 'Claim number' },
  { phrase: ['claim', 'no'], reason: 'Claim number' },
  { phrase: ['claim'], reason: 'Claim number' },
  { phrase: ['date', 'of', 'loss'], reason: 'Date of loss' },
  { phrase: ['loss', 'date'], reason: 'Date of loss' },
  { phrase: ['loss', 'details'], reason: 'Loss details' },
  { phrase: ['loss', 'description'], reason: 'Loss details' },
  { phrase: ['loss'], reason: 'Loss details' },
  { phrase: ['settlement', 'amount'], reason: 'Settlement amount' },
  { phrase: ['settlement'], reason: 'Settlement amount' },
  { phrase: ['adjuster', 'notes'], reason: 'Adjuster notes' },
  { phrase: ['adjuster'], reason: 'Adjuster notes' },
  { phrase: ['medical', 'record'], reason: 'Medical record number' },
  { phrase: ['diagnosis'], reason: 'Medical diagnosis' },
];

// Longest phrase first, so a 2-3 word label is tried before falling back to
// a shorter one that's a prefix of it (e.g. "policy number" before "policy").
const SORTED_LABELS = [...LABEL_PHRASES].sort((a, b) => b.phrase.length - a.phrase.length);

// Narrative fields that tend to run across more than one line — once the
// label is found, keep absorbing the following lines (up to a cap) instead
// of stopping at the end of the label's own line.
const MULTILINE_REASONS = new Set(['Loss details', 'Adjuster notes', 'Settlement amount', 'Medical diagnosis']);
const MAX_CONTINUATION_LINES = 3;

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

/** True if an "SSN"/"Social Security" phrase appears ANYWHERE in this line
 *  (unlike matchLabelAt, no delimiter or position requirement) - used only
 *  as a low-risk contextual gate for the bare-digit SSN check below, not to
 *  locate the value itself. */
function lineHasSsnContext(words: { text: string }[]): boolean {
  for (let i = 0; i < words.length; i++) {
    const one = normalize(words[i].text);
    if (one === 'ssn') return true;
    const two = i + 1 < words.length ? `${one} ${normalize(words[i + 1].text)}` : '';
    if (two === 'social security') return true;
  }
  return false;
}

/** Tries to match a label phrase starting at word index `start`. Returns the
 *  reason and how many words the label itself consumed, or null. */
function matchLabelAt(words: { text: string }[], start: number): { reason: string; length: number } | null {
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
 * published, not applied blind. Three kinds of matches:
 *
 *  - Structured patterns that are reliably recognizable on their own:
 *    emails, VINs, SSNs, Tax IDs (EIN), ZIP+4, phone numbers (checked over
 *    short runs of adjacent words, since OCR sometimes splits a phone
 *    number into separate tokens).
 *  - Checksum-validated digit runs: credit/debit card numbers (Luhn) and
 *    bank routing numbers (ABA checksum), also checked over short spans of
 *    adjacent words for the same OCR-splitting reason. The checksum is what
 *    makes it safe to flag these with no label nearby at all - a random
 *    number of the same length only coincidentally validates.
 *  - Labeled fields ("Policy #: ABC123", "Insured: Jane Doe", "SSN: ...")
 *    — text right after a recognized label, up to the next label or end of
 *    line. This is how things with no fixed format get caught: names,
 *    agency, address, policy/claim/account/license numbers, dates that are
 *    only sensitive in context (DOB, effective/expiration, date of loss —
 *    a bare date isn't flagged on its own, there are too many harmless ones
 *    on a quote screen), license plates, bank/credit info, loss details,
 *    settlement amounts, adjuster notes, medical info.
 *
 * Narrative fields (loss details, adjuster notes, settlement amount,
 * diagnosis) often run across more than one line, so those continue
 * absorbing the next couple of lines until another label or a blank line —
 * a deliberately wide box here is the safer failure mode than
 * under-redacting, but it does mean a genuinely multi-column layout could
 * get over-redacted next to one of these; that's exactly what the review
 * step is for.
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

    // Phone numbers, and checksum-validated card/routing numbers: OCR
    // sometimes splits these into 2-4 tokens (spaces, dashes), so check
    // short runs of adjacent words joined back together.
    for (let i = 0; i < words.length; i++) {
      for (let span = 1; span <= 4 && i + span <= words.length; span++) {
        const group = words.slice(i, i + span);
        const joined = group.map((g) => g.text).join('');
        if (PHONE_RE.test(joined)) {
          regions.push({ ...union(group.map((g) => g.bbox)), reason: 'Phone number' });
          continue;
        }
        const joinedLoose = group.map((g) => g.text).join(' ');
        if (span > 1 && !DIGIT_GROUP_RE.test(joinedLoose)) continue;
        const digitReason = classifyDigitRun(joined);
        if (digitReason) regions.push({ ...union(group.map((g) => g.bbox)), reason: digitReason });
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

  // Bare SSN (no dashes - OCR sometimes drops them, or it's just typed as
  // one 9-digit run): unlike the Luhn/ABA-checked digit runs above, SSNs
  // have no checksum, so a random 9-digit number (a policy/account/
  // reference number, say) isn't safely distinguishable from a real one -
  // this only fires on a line that also mentions "SSN"/"Social Security",
  // same contextual-gate pattern as the bare-ZIP check just above.
  for (const words of lineWords) {
    if (!lineHasSsnContext(words)) continue;
    for (let i = 0; i < words.length; i++) {
      for (let span = 1; span <= 3 && i + span <= words.length; span++) {
        const group = words.slice(i, i + span);
        const digits = group.map((g) => g.text).join('').replace(/[ -]/g, '');
        if (/^\d{9}$/.test(digits)) {
          regions.push({ ...union(group.map((g) => g.bbox)), reason: 'SSN' });
        }
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

// ============================================================
// Plain-text scanning (SOP body text, not screenshots)
// ============================================================
// Same patterns/labels as the OCR scanner above, applied to a flat string
// with character offsets instead of pixel boxes — used to catch sensitive
// info typed or pasted directly into an SOP's text (e.g. a real customer
// name left in an example), not just what's in an attached screenshot.

interface TextToken {
  text: string;
  start: number;
  end: number;
}

/** Splits text into lines of whitespace-separated tokens, each carrying its
 *  character offset in the original string. */
function tokenizeText(text: string): TextToken[][] {
  const lines: TextToken[][] = [];
  let lineStart = 0;
  const rawLines = text.split('\n');
  for (const rawLine of rawLines) {
    const tokens: TextToken[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawLine))) {
      tokens.push({ text: m[0], start: lineStart + m.index, end: lineStart + m.index + m[0].length });
    }
    lines.push(tokens);
    lineStart += rawLine.length + 1; // +1 for the '\n' split away
  }
  return lines;
}

function textUnion(tokens: TextToken[]): { start: number; end: number } {
  return {
    start: Math.min(...tokens.map((t) => t.start)),
    end: Math.max(...tokens.map((t) => t.end)),
  };
}

// SOP body text is prose, not a form - "verify the policy is active" or
// "check the claim status" would otherwise have the label matcher below
// grab the rest of the sentence as a "value" every time a field-ish word
// like "policy"/"claim"/"insured"/"name" shows up in an ordinary
// instruction. Requiring a "Label:"/"Label -"/"Label #" delimiter right
// after the label (like a real form field) is what keeps the plain-text
// scanner from flagging half of every SOP - screenshots don't need this
// (detectSensitiveRegions, above) since OCR'd system UI is already
// field-labeled, not prose.
function labelHasDelimiter(tokens: TextToken[], text: string, labelStart: number, labelLen: number): boolean {
  const lastToken = tokens[labelStart + labelLen - 1];
  if (/[:\-–—#]$/.test(lastToken.text)) return true;
  let k = lastToken.end;
  while (k < text.length && text[k] === ' ') k++;
  return /^[:\-–—#]/.test(text[k] ?? '');
}

// Merges overlapping/adjacent spans (keeping the first match's reason) -
// `text` is stale after a merge grows `end`, so scanTextForSensitiveInfo
// re-slices it from the source string afterward.
function mergeOverlappingText(matches: TextMatch[]): TextMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const merged: TextMatch[] = [];
  for (const m of sorted) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) {
      last.end = Math.max(last.end, m.end);
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

/**
 * Scans plain SOP text (not a screenshot) for the same kinds of sensitive
 * insurance info detectSensitiveRegions looks for in images - real
 * customer/claim data that should never have been left in example text.
 * Returns character-offset matches, sorted and de-overlapped, for the
 * caller to highlight or redact (see SensitiveTextScanner).
 */
export function scanTextForSensitiveInfo(text: string): TextMatch[] {
  if (!text) return [];
  const lines = tokenizeText(text);
  const matches: TextMatch[] = [];

  for (let li = 0; li < lines.length; li++) {
    const tokens = lines[li];
    for (const t of tokens) {
      const clean = t.text.replace(/[,;]+$/, '');
      const trimmedEnd = t.start + clean.length;
      if (EMAIL_RE.test(clean)) matches.push({ start: t.start, end: trimmedEnd, text: clean, reason: 'Email address' });
      else if (VIN_RE.test(clean)) matches.push({ start: t.start, end: trimmedEnd, text: clean, reason: 'VIN' });
      else if (SSN_RE.test(clean)) matches.push({ start: t.start, end: trimmedEnd, text: clean, reason: 'SSN' });
      else if (EIN_RE.test(clean)) matches.push({ start: t.start, end: trimmedEnd, text: clean, reason: 'Tax ID' });
      else if (ZIP_PLUS4_RE.test(clean)) matches.push({ start: t.start, end: trimmedEnd, text: clean, reason: 'ZIP code' });
    }

    for (let i = 0; i < tokens.length; i++) {
      for (let span = 1; span <= 4 && i + span <= tokens.length; span++) {
        const group = tokens.slice(i, i + span);
        const joined = group.map((g) => g.text).join('');
        if (PHONE_RE.test(joined)) {
          const u = textUnion(group);
          matches.push({ ...u, text: text.slice(u.start, u.end), reason: 'Phone number' });
          continue;
        }
        if (span > 1 && !DIGIT_GROUP_RE.test(group.map((g) => g.text).join(' '))) continue;
        const digitReason = classifyDigitRun(joined);
        if (digitReason) {
          const u = textUnion(group);
          matches.push({ ...u, text: text.slice(u.start, u.end), reason: digitReason });
        }
      }
    }

    // Bare SSN (no dashes): same contextual gate as the OCR scanner's
    // version above - SSNs have no checksum, so this only fires on a line
    // that also mentions "SSN"/"Social Security" (see lineHasSsnContext).
    if (lineHasSsnContext(tokens)) {
      for (let i = 0; i < tokens.length; i++) {
        for (let span = 1; span <= 3 && i + span <= tokens.length; span++) {
          const group = tokens.slice(i, i + span);
          const digits = group.map((g) => g.text).join('').replace(/[ -]/g, '');
          if (/^\d{9}$/.test(digits)) {
            const u = textUnion(group);
            matches.push({ ...u, text: text.slice(u.start, u.end), reason: 'SSN' });
          }
        }
      }
    }

    for (let i = 0; i < tokens.length; i++) {
      const match = matchLabelAt(tokens, i);
      if (!match) continue;
      if (!labelHasDelimiter(tokens, text, i, match.length)) continue;
      const valueTokens: TextToken[] = [];
      let j = i + match.length;
      if (j < tokens.length && /^[:\-–—#]+$/.test(tokens[j].text)) j++; // skip a standalone "Policy # 123" delimiter token
      for (; j < tokens.length; j++) {
        // Only let another label boundary cut the value short if IT also
        // looks like a real field label (has its own delimiter) - otherwise
        // an ordinary word that happens to double as a label elsewhere
        // (e.g. "Customer" inside "Adjuster Notes: Customer called...")
        // would wrongly end the value at zero length and the whole match
        // would get silently dropped below.
        const innerMatch = matchLabelAt(tokens, j);
        if (innerMatch && labelHasDelimiter(tokens, text, j, innerMatch.length)) break;
        valueTokens.push(tokens[j]);
      }

      // Narrative fields (loss details, adjuster notes, settlement amount,
      // diagnosis) often wrap onto the next line or two in real SOP text -
      // absorb those too, same as the OCR/image scanner does (see
      // MULTILINE_REASONS above), instead of only catching the label's own
      // line and leaving the rest of the narrative unredacted.
      if (MULTILINE_REASONS.has(match.reason)) {
        let extraLines = 0;
        let nextLi = li + 1;
        while (nextLi < lines.length && extraLines < MAX_CONTINUATION_LINES) {
          const nextTokens = lines[nextLi];
          if (nextTokens.length === 0 || matchLabelAt(nextTokens, 0)) break;
          valueTokens.push(...nextTokens);
          nextLi++;
          extraLines++;
        }
      }

      if (valueTokens.length > 0) {
        const u = textUnion(valueTokens);
        matches.push({ ...u, text: text.slice(u.start, u.end), reason: match.reason });
      }
      i = j - 1;
    }
  }

  return mergeOverlappingText(matches)
    .map((m) => ({ ...m, text: text.slice(m.start, m.end) }))
    // Re-scanning already-redacted text shouldn't re-flag the "Label: [REDACTED
    // - reason]" placeholder it just produced - only the label part changed
    // shape, the actual sensitive value is already gone.
    .filter((m) => !/^\[REDACTED\b/.test(m.text));
}
