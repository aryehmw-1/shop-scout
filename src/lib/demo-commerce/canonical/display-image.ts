import { imageForProduct } from "@/lib/catalog-images";
import { isRecycledSeedImage } from "@/lib/images/recycled-seed-images";

interface CanonicalImageInput {
  id: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  keywords?: string[];
  imageUrl?: string | null;
}

/**
 * Resolve the image to show for a canonical product. Trust a real, unique https
 * image; but if the seed assigned a RECYCLED placeholder (one image reused across
 * many unrelated products — see recycled-seed-images), suppress it and fall back
 * to a neutral, category-appropriate placeholder. Never surface a misleading
 * product photo (e.g. a MacBook image for the Ninja Air Fryer).
 */
export function canonicalDisplayImage(input: CanonicalImageInput): string {
  const imageUrl = input.imageUrl?.trim() ?? "";

  if (imageUrl.startsWith("https://") && !isRecycledSeedImage(imageUrl)) {
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
