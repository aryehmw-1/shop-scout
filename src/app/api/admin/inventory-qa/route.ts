import { NextResponse } from "next/server";
import {
  loadQaCandidates,
  submitQaReview,
  type QaReviewStatus,
  type QaReviewTag,
} from "@/lib/inventory/inventory-qa";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const flagshipOnly = url.searchParams.get("flagship") === "1";
  const status = url.searchParams.get("status") as QaReviewStatus | "all" | null;

  const { candidates, summary } = await loadQaCandidates({
    flagshipOnly,
    status: status ?? "all",
  });

  return NextResponse.json({ candidates, summary });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      priceQuoteId: string;
      catalogId: string;
      status: QaReviewStatus;
      tags?: QaReviewTag[];
      notes?: string;
    };

    if (!body.priceQuoteId || !body.catalogId || !body.status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await submitQaReview(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[inventory-qa]", e);
    return NextResponse.json({ error: "Review save failed" }, { status: 500 });
  }
}
