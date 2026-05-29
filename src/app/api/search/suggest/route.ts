import { suggestCatalogProducts, suggestQueries } from "@/lib/search/query-normalize";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({
      queries: suggestQueries(""),
      products: [],
    });
  }

  return NextResponse.json({
    queries: suggestQueries(q),
    products: suggestCatalogProducts(q, 6),
  });
}
