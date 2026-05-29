import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { ingestLinkProduct } from "@/lib/matching/link-ingest";
import { searchService } from "@/lib/search/search-service";
import { recordAnalyticsEvent } from "@/lib/analytics/record";

/** Fast pasted-link search — ingest URL, return verified equivalent offers. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sourceUrl = String(body.url ?? body.sourceUrl ?? "").trim();
    const zipCode = String(body.zipCode ?? "78701");

    if (!sourceUrl.startsWith("http")) {
      return NextResponse.json({ error: "valid url required" }, { status: 400 });
    }

    const userId = (await getSessionUserId()) ?? undefined;
    const ingest = await ingestLinkProduct(sourceUrl);
    if (!ingest) {
      await recordAnalyticsEvent({ name: "link_ingest_failed", properties: { sourceUrl } }, userId);
      return NextResponse.json({ error: "Could not parse link" }, { status: 422 });
    }

    await recordAnalyticsEvent({
      name: "link_ingest_success",
      properties: {
        sourceRetailer: ingest.sourceRetailer,
        matchTier: ingest.matchTier,
        matchConfidence: ingest.matchConfidence,
        ingestLatencyMs: ingest.ingestLatencyMs,
      },
    }, userId);

    const intent = { query: ingest.guessedTitle, zipCode, category: ingest.category };
    const productResults = await searchService.searchFromLink(
      {
        guessedTitle: ingest.guessedTitle,
        category: ingest.category,
        referencePrice: ingest.referencePrice,
        sourceUrl,
        sourceRetailer: ingest.sourceRetailer,
        catalogId: ingest.catalogId,
      },
      intent,
      { userId, linkIngest: ingest, skipPersist: body.skipPersist === true },
    );

    return NextResponse.json({ ingest, productResults });
  } catch (e) {
    console.error("[api/search/from-link]", e);
    return NextResponse.json({ error: "Link search failed" }, { status: 500 });
  }
}
