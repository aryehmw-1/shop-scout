import { resolvePrimaryProduct } from "@/lib/search/product-resolver";
import { searchService } from "@/lib/search/search-service";
import type { ShoppingIntent } from "@/lib/types";
import { NextResponse } from "next/server";

/** Background enrichment — live retailer scrape after fast search. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      intent: ShoppingIntent;
      catalogId?: string;
    };

    if (!body.intent?.query && !body.catalogId) {
      return NextResponse.json({ error: "intent or catalogId required" }, { status: 400 });
    }

    const intent: ShoppingIntent = {
      ...body.intent,
      zipCode: body.intent.zipCode ?? "78701",
    };

    const catalogId = body.catalogId ?? resolvePrimaryProduct(intent).item.id;
    const results = await searchService.enrichSearch(intent, catalogId, {
      skipPersist: false,
    });

    return NextResponse.json({
      productResults: results,
      enrichmentPending: false,
    });
  } catch (e) {
    console.error("[search/enrich]", e);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
