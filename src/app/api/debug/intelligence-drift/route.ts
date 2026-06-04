import { NextResponse } from "next/server";
import { analyzeDriftAcrossCatalog } from "@/lib/commerce-intelligence/drift/analyze";
import { loadEvalHistory } from "@/lib/commerce-intelligence/eval/history";
import { loadSnapshots } from "@/lib/commerce-intelligence/drift/snapshots";
import { listGraphIds } from "@/lib/commerce-intelligence/graph/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(req.url);
  const canonicalId = url.searchParams.get("canonicalId");

  if (canonicalId) {
    return NextResponse.json({
      snapshots: loadSnapshots(canonicalId),
    });
  }

  return NextResponse.json({
    drift: analyzeDriftAcrossCatalog(),
    history: loadEvalHistory(),
    graphIds: listGraphIds(),
  });
}
