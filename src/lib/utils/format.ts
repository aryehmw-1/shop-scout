/**
 * Normalize loosely-formatted model output into clean block Markdown so the
 * renderer can split it. LLMs often emit a list inline ("Here's why: –
 * **Consistent Fit:** ... – **Shrinkage:** ...") or drop a "> " blockquote
 * mid-sentence, which collapses into one wall of text. We promote those inline
 * markers onto their own lines.
 */
export function normalizeMarkdown(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  // A "> " highlight that appears mid-line → its own blockquote block.
  t = t.replace(/([^\n])\s+>\s+/g, "$1\n\n> ");
  // Inline bold-led list items: " – **Label:**" → bullet. We ONLY split when the
  // bold segment is a label ending in a colon (the real inline-list pattern), so
  // price rows like "**Amazon** — **$4.04** — Whole Milk" stay on ONE bullet.
  t = t.replace(/\s+[–—-]\s+(?=\*\*[^*\n]+:\*\*)/g, "\n- ");
  // Inline "•" bullets → newline bullets.
  t = t.replace(/\s*•\s+/g, "\n- ");
  // Collapse 3+ newlines.
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** Turn **bold** segments into React-friendly parts */
export function parseBoldText(text: string): Array<{ bold: boolean; text: string }> {
  const parts: Array<{ bold: boolean; text: string }> = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ bold: false, text: text.slice(lastIndex, match.index) });
    }
    parts.push({ bold: true, text: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ bold: false, text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ bold: false, text }];
}

export function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}
