const CACHE = new Map<string, { url: string; expiresAt: number }>();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;

const GROCERY_CATEGORIES = new Set([
  "salad",
  "dairy",
  "bakery",
  "produce",
  "meat",
  "pantry",
  "household",
]);

interface OffProductResponse {
  status?: number;
  product?: {
    image_front_url?: string;
    image_url?: string;
    image_small_url?: string;
  };
}

/**
 * Real product packshots from Open Food Facts (free, no API key).
 * Works when the catalog item has a real UPC/barcode.
 */
export async function fetchProductImageFromOpenFoodFacts(
  upc: string,
  category?: string,
): Promise<string | undefined> {
  if (category && !GROCERY_CATEGORIES.has(category)) return undefined;

  const barcode = upc.replace(/\D/g, "");
  if (barcode.length < 8 || barcode.length > 14) return undefined;

  const cached = CACHE.get(barcode);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      },
    );

    if (!res.ok) return undefined;

    const data = (await res.json()) as OffProductResponse;
    if (data.status !== 1 || !data.product) return undefined;

    const raw =
      data.product.image_front_url ??
      data.product.image_url ??
      data.product.image_small_url;

    if (!raw) return undefined;

    const url = raw.startsWith("http") ? raw : `https:${raw}`;
    if (!url.startsWith("https://")) return undefined;

    CACHE.set(barcode, { url, expiresAt: Date.now() + TTL_MS });
    return url;
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      console.error("[OpenFoodFacts] image lookup failed", e);
    }
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
