import { imageForProduct } from "@/lib/catalog-images";
import {
  isRecycledSeedImage,
  amazonAsinImageUrl,
} from "@/lib/images/recycled-seed-images";

interface CanonicalImageInput {
  id: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  keywords?: string[];
  imageUrl?: string | null;
  /** Amazon ASIN — used to recover the REAL product photo when the seed image
   *  is a recycled placeholder. */
  asin?: string | null;
}

/**
 * Resolve the image to show for a canonical product:
 *   1. A real, unique seed https image → use it.
 *   2. Seed image is recycled/missing but we have an ASIN → the AUTHORITATIVE
 *      Amazon image-by-ASIN photo (air fryer shows an air fryer). Invalid ASINs
 *      return a blank, never an unrelated product.
 *   3. Otherwise → a neutral, category-appropriate placeholder.
 * Never surfaces a misleading product photo (e.g. a MacBook for the Ninja Air Fryer).
 */
export function canonicalDisplayImage(input: CanonicalImageInput): string {
  const imageUrl = input.imageUrl?.trim() ?? "";

  if (imageUrl.startsWith("https://") && !isRecycledSeedImage(imageUrl)) {
    return imageUrl;
  }

  const asinImage = amazonAsinImageUrl(input.asin);
  if (asinImage) return asinImage;

  return imageForProduct({
    id: input.id,
    category: input.category ?? "general",
    title: input.title,
    brand: input.brand ?? "",
    keywords: input.keywords ?? [],
  });
}
