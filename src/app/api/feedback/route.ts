import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { recordAnalyticsEvent } from "@/lib/analytics/record";
import { prisma } from "@/lib/db/prisma";
import type { RetailerId } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { offerId, retailer, catalogId, rating, reason, comment } = body;

    if (!offerId || !retailer || !rating) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    const userId = (await getSessionUserId()) ?? undefined;

    await recordAnalyticsEvent(
      {
        name: "feedback_submitted",
        properties: { offerId, retailer, catalogId, rating, reason, comment },
      },
      userId,
    );

    if (rating === "inaccurate" && retailer) {
      const rid = retailer as RetailerId;
      const existing = await prisma.retailerQualityMetric.findUnique({
        where: { retailerId: rid },
      });
      if (existing) {
        await prisma.retailerQualityMetric.update({
          where: { retailerId: rid },
          data: {
            offersRejected: existing.offersRejected + 1,
            trustScore: Math.max(0.1, existing.trustScore - 0.02),
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/feedback]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
