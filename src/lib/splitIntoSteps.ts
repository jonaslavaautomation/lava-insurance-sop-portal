// Matches a plain numeric marker ("1: ", "2. ") or one with a "Step" word in
// front of it ("Step 1: ", "STEP 2. ") — a document is very often built as
// "Step 1: <heading> / 1. <sub-step> / 2. <sub-step> / Step 2: <heading> /
// 1. <sub-step> / ...", where the numbering restarts inside every step. All
// of those still need to become their own separate items.
const NUMERIC_MARKER_RE = /(?:^|\s)(?:step\s+)?(\d{1,3})[:.]\s/gi;
const NUMERIC_PREFIX_RE = /^(?:step\s+)?\d{1,3}[:.]\s*/i;

// U+2022 •, U+25E6 ◦, U+25AA ▪, U+25CF ●, U+25CB ○ — the common round/square
// bullet glyphs. Real documents often mix these with numbered sub-steps in
// the very same body of text (numbered steps for actions, bullets for a
// checklist under one of them) rather than picking one convention.
const BULLET_CHARS_G = /[•◦▪●○]/g;
const BULLET_PREFIX_RE = /^[•◦▪●○]\s*/;

// Used once a document has already qualified as list-like (see
// splitIntoListItems) to do the actual splitting: breaks before EITHER kind
// of marker, in whatever order/mixture they actually appear in the text.
const COMBINED_SPLIT_RE = /(?=(?:^|\s)(?:step\s+)?\d{1,3}[:.]\s)|(?=[•◦▪●○])/gi;
const LIST_ITEM_START_RE = /^(?:(?:step\s+)?\d{1,3}[:.]\s|[•◦▪●○])/i;

/**
 * Recognizes an explicit list structure — numeric markers ("1: Do this",
 * "2. Do that", the shape a Tango-exported PDF/Word doc uses, "Step N:"
 * headings included) and/or bullet points ("• Do this") — and splits into
 * one string per item, in document order, however the two are mixed.
 * Returns null when neither pattern is confidently present (plain prose).
 *
 * Use this where you only want to act on *bona fide* list items — e.g.
 * deciding whether an upload's extracted images correspond one-per-item.
 */
export function splitIntoListItems(text: string): string[] | null {
  const markerNumbers = [...text.matchAll(NUMERIC_MARKER_RE)].map((m) => parseInt(m[1], 10));
  const bulletCount = (text.match(BULLET_CHARS_G) || []).length;

  // Guard against incidental matches (a time like "3:00", a lone "Section
  // 2.") by requiring the numbered list to start near the top, like a real
  // step-by-step doc does — but NOT that the numbers keep climbing
  // continuously: "Step 1: ... 1. ... 2. ... Step 2: ... 1. ..." is a
  // completely normal nested/restarting numbering scheme and must still
  // split into one item per marker, not get rejected as "not a real list".
  const hasNumberedList = markerNumbers.length >= 3 && markerNumbers[0] <= 2;
  const hasBulletList = bulletCount >= 3;
  if (!hasNumberedList && !hasBulletList) return null;

  const items = text
    .split(COMBINED_SPLIT_RE)
    .map((part) => part.trim())
    // Drops any preamble before the first marker (e.g. a document title
    // that got merged into the same block as the steps by layout
    // reconstruction — already shown separately as the SOP's own title).
    .filter((part) => LIST_ITEM_START_RE.test(part))
    .map((part) => part.replace(NUMERIC_PREFIX_RE, '').replace(BULLET_PREFIX_RE, '').trim())
    .filter(Boolean);

  return items.length >= 3 ? items : null;
}

/**
 * Splits SOP text into an ordered list of step/item strings for display, so
 * every SOP — whatever shape it was written in — reads as the same
 * numbered walkthrough. Tries numeric markers and/or bullets (see
 * splitIntoListItems), then falls back to blank-line-separated paragraphs
 * so even plain prose gets numbered rather than left as one flat block.
 * Never returns null for non-empty input.
 */
export function splitIntoSteps(text: string): string[] | null {
  return splitIntoListItems(text) ?? splitOnParagraphs(text);
}

function splitOnParagraphs(text: string): string[] | null {
  const items = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}
