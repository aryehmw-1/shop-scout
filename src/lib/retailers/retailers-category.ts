import { getRetailerMeta } from "./meta";
import type { RetailerId } from "../types";

const GROCERY_CATEGORIES = new Set([
  "salad",
  "dairy",
  "bakery",
  "produce",
  "meat",
  "pantry",
  "household",
]);

/**
 * Whether a retailer should appear for a catalog item category.
 * Grocery items only show grocery chains (not furniture "general" stores).
 */
export function retailerSellsCategory(
  retailerId: RetailerId,
  category: string,
): boolean {
  const meta = getRetailerMeta(retailerId);

  if (GROCERY_CATEGORIES.has(category)) {
    return meta.types.includes("grocery");
  }

  switch (category) {
    case "clothing":
      return meta.types.includes("clothing") || meta.types.includes("general");
    case "shoes":
      return meta.types.includes("shoes") || meta.types.includes("general");
    case "sports":
      return (
        meta.types.includes("sports") ||
        meta.types.includes("clothing") ||
        meta.types.includes("shoes")
      );
    case "books":
      return meta.types.includes("books");
    case "bedding":
      return meta.types.includes("bedding") || meta.types.includes("home");
    case "home":
      return meta.types.includes("home") || meta.types.includes("bedding");
    default:
      return meta.types.includes("general") || meta.types.length > 0;
  }
}
