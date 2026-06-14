import { NextResponse } from "next/server";
import { loadVerifiedInventoryBrowse, type VerifiedBrowseMode } from "@/lib/inventory/verified-inventory-browse";

export const dynamic = "force-dynamic";

/**
 * Paginated inventory browse for the client (load-more + server-side search).
 * GET /api/inventory/browse?offset=48&limit=48&q=soap&mode=all
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 48);
  const offset = Number(searchParams.get("offset") ?? 0);
  const query = searchParams.get("q") ?? undefined;
  const mode = (searchParams.get("mode") ?? "all") as VerifiedBrowseMode;

  const result = await loadVerifiedInventoryBrowse(mode, { limit, offset, query });
  return NextResponse.json({
    products: result.products,
    totalProducts: result.totalProducts,
    offset,
    limit,
  });
}
