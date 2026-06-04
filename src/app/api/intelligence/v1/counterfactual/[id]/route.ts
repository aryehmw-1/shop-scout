import { NextResponse } from "next/server";
import { intelligenceCounterfactual } from "@/lib/commerce-intelligence/service/intelligence-api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const result = intelligenceCounterfactual(decodeURIComponent(id));
  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
