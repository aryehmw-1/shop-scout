import { NextResponse } from "next/server";
import { getCanonicalProductById } from "@/lib/demo-commerce/canonical/store";
import {
  buildIntelligenceGraph,
  graphToRetrievalPayload,
} from "@/lib/commerce-intelligence";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const canonical = getCanonicalProductById(decodeURIComponent(id));
  if (!canonical) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const graph = buildIntelligenceGraph(canonical);
  const retrieval = graphToRetrievalPayload(graph, canonical.canonical_title);

  return NextResponse.json({
    graph,
    retrieval,
    meta: {
      validated_offer_count: graph.offers.filter((o) => o.validation_status === "validated")
        .length,
      identity_confidence: graph.identity_confidence.overall,
    },
  });
}
