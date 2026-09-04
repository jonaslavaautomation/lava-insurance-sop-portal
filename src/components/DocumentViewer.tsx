interface Block {
  heading: boolean;
  text: string;
}

/**
 * Splits plain-text SOP content into paragraph/heading blocks so it reads
 * consistently no matter what it was uploaded as (PDF, Word, or pasted
 * text all end up as plain text — see lib/extractDocument.ts). A short,
 * single-line paragraph with no closing punctuation is treated as a
 * heading (e.g. "Cancellation Requirements"); everything else is a normal
 * paragraph, with single line breaks inside it preserved.
 */
function parseBlocks(content: string): Block[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text) => {
      const singleLine = !text.includes('\n');
      const heading = singleLine && text.length <= 80 && !/[.,;:?!]$/.test(text);
      return { heading, text };
    });
}

export function DocumentViewer({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  if (blocks.length === 0) {
    return <p className="text-sm text-slate-400">No content.</p>;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, i) =>
        block.heading ? (
          <h3 key={i} className="text-sm font-bold text-slate-900 pt-1">
            {block.text}
          </h3>
        ) : (
          <p key={i} className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {block.text}
          </p>
        )
      )}
    </div>
  );
}
