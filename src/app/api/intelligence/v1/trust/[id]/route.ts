import { NextResponse } from "next/server";
import { intelligenceTrustSummary } from "@/lib/commerce-intelligence/service/intelligence-api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const summary = intelligenceTrustSummary(decodeURIComponent(id));
  if (!summary) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ explanation: summary });
}
