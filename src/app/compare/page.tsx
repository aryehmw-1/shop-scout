import { redirect } from "next/navigation";
import { inventoryService } from "@/lib/inventory/inventory-service";

// The standalone Compare Prices page is RETIRED — comparison now happens inside
// the AI chat experience. This route only resolves whatever context it was given
// (a free-text query, or a product catalogId) into a chat query and redirects to
// /chat, where the assistant compares offers immediately. Kept as a redirect so
// old links, bookmarks, and the inventory "Compare" button all land in chat.

type ComparePageProps = {
  searchParams?: Promise<{
    q?: string;
    product?: string;
    catalog?: string;
    zip?: string;
  }>;
};

/** Best chat query for a given product id: the matched product's name (so the
 *  assistant searches/compares the right item), falling back to its first offer. */
async function queryForProduct(productId: string): Promise<string | null> {
  try {
    const results = await inventoryService.getProductResultsById(decodeURIComponent(productId));
    const matched = results?.matchedProduct;
    if (matched?.title) return `${matched.brand ?? ""} ${matched.title}`.trim();
    const first = results?.online[0];
    if (first) return `${first.brand ?? ""} ${first.title ?? ""}`.trim();
  } catch {
    /* fall through to a bare chat redirect */
  }
  return null;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = (await searchParams) ?? {};
  const query = params.q?.trim();
  const productId = (params.product ?? params.catalog ?? "").trim();

  const chatQuery = query || (productId ? await queryForProduct(productId) : null);
  redirect(chatQuery ? `/chat?q=${encodeURIComponent(chatQuery)}` : "/chat");
}
