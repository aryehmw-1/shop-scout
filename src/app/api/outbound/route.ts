import { NextResponse } from "next/server";
import { decodeOutboundTarget } from "@/lib/affiliate/outbound";
import { getSessionUserId } from "@/lib/auth/session";
import { recordAnalyticsEvent } from "@/lib/analytics/record";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const encoded = searchParams.get("to");
  if (!encoded) {
    return NextResponse.json({ error: "missing destination" }, { status: 400 });
  }

  const target = decodeOutboundTarget(encoded);
  if (!target) {
    return NextResponse.json({ error: "invalid destination" }, { status: 400 });
  }

  const offerId = searchParams.get("oid") ?? undefined;
  const retailer = searchParams.get("r") ?? undefined;
  const catalogId = searchParams.get("cid") ?? undefined;
  const isBestDeal = searchParams.get("bd") === "1";
  const price = searchParams.get("p");
  const dealScore = searchParams.get("ds");
  const percentBelowMarket = searchParams.get("pbm");
  const source = searchParams.get("src") ?? undefined;
  const query = searchParams.get("q") ?? undefined;
  const sessionId = searchParams.get("sid") ?? undefined;

  let experimentVariants: Record<string, string> | undefined;
  try {
    const exp = searchParams.get("exp");
    if (exp) experimentVariants = JSON.parse(exp) as Record<string, string>;
  } catch {
    /* ignore */
  }

  const userId = (await getSessionUserId()) ?? undefined;

  const clickProps = {
    offerId,
    retailer,
    catalogId,
    price: price != null ? Number(price) : undefined,
    isBestDeal,
    dealScore: dealScore != null ? Number(dealScore) : undefined,
    percentBelowMarket:
      percentBelowMarket != null ? Number(percentBelowMarket) : undefined,
    source,
    query,
    experimentVariants: experimentVariants ?
      JSON.stringify(experimentVariants)
    : undefined,
    sessionId,
  };

  await recordAnalyticsEvent(
    {
      name: isBestDeal ? "best_deal_click" : "offer_click",
      properties: clickProps,
      sessionId,
    },
    userId,
  );

  return NextResponse.redirect(target, { status: 302 });
}
