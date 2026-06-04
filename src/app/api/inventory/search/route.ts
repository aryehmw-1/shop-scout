import { NextResponse } from "next/server";
import type { ShoppingIntent } from "@/lib/types";
import { searchService } from "@/lib/search/search-service";

export const dynamic = "force-dynamic";

/** Product lookup for compare/search pages; includes connected product data providers. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  const zip = searchParams.get("zip")?.trim() || "78701";

  if (!query || query.length < 2) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const intent: ShoppingIntent = { query, zipCode: zip };
  const productResults = await searchService.search(intent, {
    mode: "compare",
    skipHistory: true,
  });

  return NextResponse.json({
    matched: productResults.online.length > 0,
    matchScore: productResults.online.length > 0 ? 0.8 : 0,
    matchReason: "search_service",
    source: "search_service",
    productResults,
    commerceInsight: productResults.intelligenceInsight,
  });
}
