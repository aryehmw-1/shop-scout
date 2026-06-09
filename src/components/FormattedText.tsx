import { normalizeMarkdown, parseBoldText } from "@/lib/utils/format";

/** Render inline **bold** segments within a single line of text. */
function Inline({ text }: { text: string }) {
  const parts = parseBoldText(text);
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-stone-900">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "para"; text: string };

/**
 * Lightweight markdown block parser. Supports headings (##/###), bullet lists
 * (-, *, •), blockquotes (>), and blank-line-separated paragraphs — enough to
 * render ChatGPT-style structured answers without a heavy markdown dependency.
 */
function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let list: string[] | null = null;
  let quote: string[] | null = null;
  let para: string[] | null = null;

  const flush = () => {
    if (list) {
      blocks.push({ type: "list", items: list });
      list = null;
    }
    if (quote) {
      blocks.push({ type: "quote", lines: quote });
      quote = null;
    }
    if (para) {
      blocks.push({ type: "para", text: para.join(" ") });
      para = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = line.match(/^([-*•])\s+(.*)$/);
    if (bullet) {
      if (para) flush();
      if (quote) flush();
      (list ??= []).push(bullet[2]);
      continue;
    }
    const quoteLine = line.match(/^>\s?(.*)$/);
    if (quoteLine) {
      if (para) flush();
      if (list) flush();
      (quote ??= []).push(quoteLine[1]);
      continue;
    }
    if (list) flush();
    if (quote) flush();
    (para ??= []).push(line);
  }
  flush();
  return blocks;
}

export function FormattedText({ text }: { text: string }) {
  const blocks = parseBlocks(normalizeMarkdown(text));

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const cls =
            block.level <= 2
              ? "font-display text-lg font-bold text-stone-950"
              : "text-base font-semibold text-stone-900";
          return (
            <p key={i} className={cls}>
              <Inline text={block.text} />
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <Inline text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-orange-300 pl-3 italic text-stone-600"
            >
              {block.lines.map((l, j) => (
                <p key={j}>
                  <Inline text={l} />
                </p>
              ))}
            </blockquote>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
