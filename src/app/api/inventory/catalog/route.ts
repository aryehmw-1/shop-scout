import { NextResponse } from "next/server";
import { queryCanonicalCatalog, hasCanonicalCatalog } from "@/lib/demo-commerce/canonical/store";
import { filterPublicCanonicalCatalog } from "@/lib/retailers/public-retailers";

export const dynamic = "force-dynamic";

/** Public multi-store inventory catalog for client checks. */
export async function GET() {
  if (!hasCanonicalCatalog()) {
    return NextResponse.json({
      total: 0,
      products: [],
      categories: [],
      retailers: [],
      updatedAt: null,
    });
  }
  const catalog = filterPublicCanonicalCatalog(queryCanonicalCatalog());
  return NextResponse.json(catalog);
}
