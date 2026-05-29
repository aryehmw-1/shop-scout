import { getSessionUserId } from "@/lib/auth/session";
import { searchService } from "@/lib/search/search-service";
import type { ShoppingIntent } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const intent: ShoppingIntent = {
      query: body.query ?? "",
      organic: body.organic,
      maxPrice: body.maxPrice,
      zipCode: body.zipCode ?? "78701",
      category: body.category,
      gender: body.gender,
      ageGroup: body.ageGroup,
      brand: body.brand,
      colors: body.colors,
      size: body.size,
    };

    if (!intent.query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const userId = (await getSessionUserId()) ?? undefined;
    const productResults = await searchService.search(intent, {
      userId,
      skipImages: body.skipImages === true,
      skipCache: body.skipCache === true,
      skipPersist: body.skipPersist === true,
      skipHistory: body.skipHistory === true,
    });
    return NextResponse.json({ productResults });
  } catch (e) {
    console.error("search error", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
