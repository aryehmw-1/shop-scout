import { buildGroceryRetrievalDebug } from "@/lib/search/grocery-retrieval-debug";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing query param q" }, { status: 400 });
  }

  const zip = searchParams.get("zip")?.trim() ?? "";
  const intent = { query, zipCode: zip || undefined };

  const debug = buildGroceryRetrievalDebug(intent, []);
  return NextResponse.json(debug);
}
