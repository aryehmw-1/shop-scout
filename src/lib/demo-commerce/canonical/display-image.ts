import { imageForProduct } from "@/lib/catalog-images";

const KNOWN_REUSED_DEMO_IMAGES = new Set([
  "https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg",
]);

const DEMO_PLACEHOLDER_IMAGE_IDS = new Set([
  "bounty-paper-towels",
  "cheerios-cereal",
  "chobani-greek-yogurt",
  "organic-eggs-dozen",
  "organic-whole-milk",
]);

interface CanonicalImageInput {
  id: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  keywords?: string[];
  imageUrl?: string | null;
}

export function canonicalDisplayImage(input: CanonicalImageInput): string {
  const imageUrl = input.imageUrl?.trim() ?? "";
  const isKnownGoodAirPodsImage =
    input.id === "apple-airpods-pro-2" && KNOWN_REUSED_DEMO_IMAGES.has(imageUrl);
  const shouldUseDemoPlaceholder =
    DEMO_PLACEHOLDER_IMAGE_IDS.has(input.id) && input.id !== "apple-airpods-pro-2";

  if (
    imageUrl.startsWith("https://") &&
    !shouldUseDemoPlaceholder &&
    (!KNOWN_REUSED_DEMO_IMAGES.has(imageUrl) || isKnownGoodAirPodsImage)
  ) {
    return imageUrl;
  }

  return imageForProduct({
    id: input.id,
    category: input.category ?? "general",
    title: input.title,
    brand: input.brand ?? "",
    keywords: input.keywords ?? [],
  });
}
