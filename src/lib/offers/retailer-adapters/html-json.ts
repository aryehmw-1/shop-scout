/** Pull JSON from `<script id="__NEXT_DATA__">` or similar embedded blobs. */
export function extractNextData(html: string): unknown | undefined {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return undefined;
  try {
    return JSON.parse(m[1]) as unknown;
  } catch {
    return undefined;
  }
}

export function extractScriptJsonById(
  html: string,
  id: string,
): unknown | undefined {
  const re = new RegExp(
    `<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i",
  );
  const m = html.match(re);
  if (!m?.[1]) return undefined;
  try {
    return JSON.parse(m[1]) as unknown;
  } catch {
    return undefined;
  }
}

/** Depth-first collect objects where predicate matches. */
export function collectObjects(
  node: unknown,
  predicate: (obj: Record<string, unknown>) => boolean,
  max = 50,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  function walk(n: unknown): void {
    if (out.length >= max || !n || typeof n !== "object") return;
    if (seen.has(n)) return;
    seen.add(n);

    if (Array.isArray(n)) {
      for (const child of n) walk(child);
      return;
    }

    const obj = n as Record<string, unknown>;
    if (predicate(obj)) out.push(obj);
    for (const v of Object.values(obj)) walk(v);
  }

  walk(node);
  return out;
}

export function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}
