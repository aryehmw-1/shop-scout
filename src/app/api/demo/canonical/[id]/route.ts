import { NextResponse } from "next/server";
import { getCanonicalProductById } from "@/lib/demo-commerce/canonical/store";
import { canonicalToSearchResults } from "@/lib/demo-commerce/canonical/to-search-results";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const product = getCanonicalProductById(decodeURIComponent(id));
  if (!product) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    product,
    productResults: canonicalToSearchResults(product),
  });
}
