const IMAGE_CACHE = new Map<string, { url: string; expiresAt: number }>();
const IMAGE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

interface OpenverseImage {
  url?: string;
  thumbnail?: string;
  title?: string;
  mature?: boolean;
}

interface OpenverseResponse {
  results?: OpenverseImage[];
}

/**
 * Free product-style photo fallback (Openverse / CC search).
 * Hero fallback when catalog / Amazon PA-API have no suitable image.
 */
export async function fetchProductImageFromOpenverse(
  searchQuery: string,
): Promise<string | undefined> {
  const base = searchQuery.trim().slice(0, 90);
  if (!base) return undefined;
  const q = /\b(product|pack|package)\b/i.test(base) ? base : `${base} product`;

  const cached = IMAGE_CACHE.get(q);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  const params = new URLSearchParams({
    q,
    page_size: "12",
    license: "cc0,pdm,by,by-sa",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?${params.toString()}`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      },
    );

    if (!res.ok) return undefined;

    const data = (await res.json()) as OpenverseResponse;

    for (const row of data.results ?? []) {
      if (row.mature) continue;
      const url = row.url ?? row.thumbnail;
      if (!url?.startsWith("https://")) continue;
      if (/logo|icon|banner|sprite|avatar|favicon|map|diagram/i.test(url)) continue;
      IMAGE_CACHE.set(q, { url, expiresAt: Date.now() + IMAGE_TTL_MS });
      return url;
    }

    return undefined;
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      console.error("[Openverse Images] fetch failed", e);
    }
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
