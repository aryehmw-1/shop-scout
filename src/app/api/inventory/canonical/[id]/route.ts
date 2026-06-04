import { NextResponse } from "next/server";
import {
  getCanonicalProductById,
  hasCanonicalCatalog,
  queryCanonicalCatalog,
} from "@/lib/demo-commerce/canonical/store";
import { canonicalToSearchResults } from "@/lib/demo-commerce/canonical/to-search-results";
import { filterPublicCanonicalCatalog } from "@/lib/retailers/public-retailers";

export const dynamic = "force-dynamic";

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

export async function HEAD() {
  if (!hasCanonicalCatalog()) {
    return new NextResponse(null, { status: 404 });
  }
  const catalog = filterPublicCanonicalCatalog(queryCanonicalCatalog());
  return new NextResponse(null, {
    status: 200,
    headers: { "X-Inventory-Count": String(catalog.total) },
  });
}
