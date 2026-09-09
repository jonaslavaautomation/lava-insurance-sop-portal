// Matches a plain numeric marker ("1: ", "2. ") or one with a "Step" word in
// front of it ("Step 1: ", "STEP 2. ") — a document is very often built as
// "Step 1: <heading> / 1. <sub-step> / 2. <sub-step> / Step 2: <heading> /
// 1. <sub-step> / ...", where the numbering restarts inside every step. All
// of those still need to become their own separate items.
const NUMERIC_START_RE = /^(?:step\s+)?\d{1,3}[:.]\s/i;
const NUMERIC_MARKER_RE = /(?:^|\s)(?:step\s+)?(\d{1,3})[:.]\s/gi;
const NUMERIC_SPLIT_RE = /(?=(?:^|\s)(?:step\s+)?\d{1,3}[:.]\s)/i;
const NUMERIC_PREFIX_RE = /^(?:step\s+)?\d{1,3}[:.]\s*/i;

const BULLET_CHARS_G = /[•◦▪●]/g;
const BULLET_SPLIT_RE = /(?=[•◦▪●])/;
const BULLET_PREFIX_RE = /^[•◦▪●]\s*/;

/**
 * Recognizes an explicit list structure — numeric markers ("1: Do this",
 * "2. Do that", the shape a Tango-exported PDF/Word doc uses) or bullet
 * points ("• Do this") — and splits into one string per item. Returns null
 * when neither pattern is confidently present (plain prose).
 *
 * Use this where you only want to act on *bona fide* list items — e.g.
 * deciding whether an upload's extracted images correspond one-per-item.
 */
export function splitIntoListItems(text: string): string[] | null {
  return splitOnNumericMarkers(text) ?? splitOnBullets(text);
}

/**
 * Splits SOP text into an ordered list of step/item strings for display, so
 * every SOP — whatever shape it was written in — reads as the same
 * numbered walkthrough. Tries numeric markers, then bullets (see
 * splitIntoListItems), then falls back to blank-line-separated paragraphs
 * so even plain prose gets numbered rather than left as one flat block.
 * Never returns null for non-empty input.
 */
export function splitIntoSteps(text: string): string[] | null {
  return splitIntoListItems(text) ?? splitOnParagraphs(text);
}

function splitOnNumericMarkers(text: string): string[] | null {
  const markerNumbers = [...text.matchAll(NUMERIC_MARKER_RE)].map((m) => parseInt(m[1], 10));
  if (markerNumbers.length < 3) return null;

  // Guard against incidental matches (a time like "3:00", a lone "Section
  // 2.") by requiring the list to start near the top, like a real
  // step-by-step doc does — but NOT that the numbers keep climbing
  // continuously: "Step 1: ... 1. ... 2. ... Step 2: ... 1. ..." is a
  // completely normal nested/restarting numbering scheme and must still
  // split into one item per marker, not get rejected as "not a real list".
  if (markerNumbers[0] > 2) return null;

  const items = text
    .split(NUMERIC_SPLIT_RE)
    .map((part) => part.trim())
    // Drops any preamble before the first "1:" (e.g. a document title that
    // got merged into the same block as the steps by layout reconstruction).
    .filter((part) => NUMERIC_START_RE.test(part))
    .map((part) => part.replace(NUMERIC_PREFIX_RE, '').trim())
    .filter(Boolean);

  return items.length >= 3 ? items : null;
}

function splitOnBullets(text: string): string[] | null {
  const bulletCount = (text.match(BULLET_CHARS_G) || []).length;
  if (bulletCount < 3) return null;

  const items = text
    .split(BULLET_SPLIT_RE)
    .map((part) => part.replace(BULLET_PREFIX_RE, '').trim())
    .filter(Boolean);

  return items.length >= 3 ? items : null;
}

function splitOnParagraphs(text: string): string[] | null {
  const items = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}
