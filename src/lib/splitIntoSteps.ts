// Matches a plain numeric marker ("1: ", "2. ") or one with a "Step" word in
// front of it ("Step 1: ", "STEP 2. ", or just "Step 1 " with no punctuation
// at all — real documents commonly write step headings as "Step 1 <Title>"
// with nothing but a space between the number and the title). A document is
// very often built as "Step 1: <heading> / 1. <sub-step> / 2. <sub-step> /
// Step 2: <heading> / 1. <sub-step> / ...", where the numbering restarts
// inside every step. All of those still need to become their own separate
// items. A bare number with no "step" word needs real punctuation (":" or
// ".") right after it to count — otherwise ordinary prose ("wait 2 hours")
// would constantly false-positive — but the space *after* that punctuation
// is optional, since some documents write "1.Click..." with no space at all.
const NUMERIC_MARKER_RE = /(?:^|\s)(?:step\s+(\d{1,3})(?:[:.]\s*|\s+)|(\d{1,3})[:.]\s*)/gi;
const NUMERIC_PREFIX_RE = /^(?:step\s+\d{1,3}(?:[:.]\s*|\s+)|\d{1,3}[:.]\s*)/i;

// A "Step N" heading specifically (not a bare sub-item number) — used to
// find the outer step boundaries in splitOnStepHeadings, below.
const STEP_HEADING_RE = /(?:^|\n)\s*step\s+(\d{1,3})(?:[:.]\s*|\s+)/gi;
const STEP_HEADING_PREFIX_RE = /^step\s+\d{1,3}(?:[:.]\s*|\s+)/i;

// U+2022 •, U+25E6 ◦, U+25AA ▪, U+25CF ●, U+25CB ○ — the common round/square
// bullet glyphs. Real documents often mix these with numbered sub-steps in
// the very same body of text (numbered steps for actions, bullets for a
// checklist under one of them) rather than picking one convention.
const BULLET_CHARS_G = /[•◦▪●○]/g;
const BULLET_PREFIX_RE = /^[•◦▪●○]\s*/;

// Used once a document has already qualified as list-like (see
// splitIntoListItems) to do the actual splitting: breaks before EITHER kind
// of marker, in whatever order/mixture they actually appear in the text.
const COMBINED_SPLIT_RE = /(?=(?:^|\s)(?:step\s+\d{1,3}(?:[:.]\s*|\s+)|\d{1,3}[:.]\s*))|(?=[•◦▪●○])/gi;
const LIST_ITEM_START_RE = /^(?:step\s+\d{1,3}(?:[:.]\s*|\s+)|\d{1,3}[:.]\s*|[•◦▪●○])/i;

/**
 * Recognizes an explicit list structure — numeric markers ("1: Do this",
 * "2. Do that", the shape a Tango-exported PDF/Word doc uses, "Step N:"
 * headings included) and/or bullet points ("• Do this") — and splits into
 * one string per item, in document order, however the two are mixed.
 * Returns null when neither pattern is confidently present (plain prose).
 *
 * This treats every marker as the same flat level — a "Step N" heading and
 * its own nested "1./2." sub-items all become separate same-level items.
 * That's the right shape for a genuinely flat checklist, but the wrong one
 * for a document that's really "a few named steps, each with its own
 * numbered sub-instructions and its own screenshot" — see
 * splitOnStepHeadings for that shape instead.
 *
 * Use this where you only want to act on *bona fide* list items — e.g.
 * deciding whether an upload's extracted images correspond one-per-item.
 */
export function splitIntoListItems(text: string): string[] | null {
  const markerNumbers = [...text.matchAll(NUMERIC_MARKER_RE)].map((m) => parseInt(m[1] ?? m[2], 10));
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
 * Recognizes a document built as a small number of named "Step N" sections
 * — each with its own heading, its own body text (which may itself contain
 * a nested numbered/bulleted sub-list — left intact, not re-split), and
 * typically its own screenshot — and splits into one raw chunk per step
 * (heading line + everything up to the next "Step N"). Unlike
 * splitIntoListItems, a "Step N" heading and the sub-items inside its body
 * are NOT flattened into the same list: the heading marks a step boundary,
 * everything after it until the next heading belongs to that one step.
 *
 * Requires at least 2 "Step N" headings — "step" immediately followed by a
 * number is unambiguous enough on its own (unlike a bare number) that it
 * doesn't need the same false-positive guard splitIntoListItems uses.
 *
 * Returns null when there aren't at least 2 such headings.
 */
export function splitOnStepHeadings(text: string): string[] | null {
  const headingMatches = [...text.matchAll(STEP_HEADING_RE)];
  if (headingMatches.length < 2) return null;

  const chunks: string[] = [];
  for (let i = 0; i < headingMatches.length; i++) {
    const start = headingMatches[i].index ?? 0;
    const end = i + 1 < headingMatches.length ? (headingMatches[i + 1].index ?? text.length) : text.length;
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks.length >= 2 ? chunks : null;
}

/**
 * Splits one "Step N <title>\n\n<body>" chunk (as returned by
 * splitOnStepHeadings) into a clean title (just the heading's own line,
 * with the "Step N" prefix stripped) and description (everything after —
 * including any nested numbered/bulleted sub-list, left as-is).
 */
export function splitStepChunk(chunk: string): { title: string; description: string } {
  const stripped = chunk.replace(STEP_HEADING_PREFIX_RE, '').trim();
  const firstBreak = stripped.search(/\n/);
  if (firstBreak === -1) return { title: stripped, description: '' };
  return {
    title: stripped.slice(0, firstBreak).trim(),
    description: stripped.slice(firstBreak).trim(),
  };
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
