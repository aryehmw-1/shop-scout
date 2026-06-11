import { NextResponse } from "next/server";
import { runRawValidationBatch } from "@/lib/pipeline/batch";

/**
 * Nightly verification pass over newly-ingested + stale raw product records.
 * Revalidation NEVER happens during live user search — only here.
 * Secure with CRON_SECRET (Vercel Cron, GitHub Actions, or manual curl).
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://homivion.com/api/cron/validate-products
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 300), 1000);
  const useAi = url.searchParams.get("ai") !== "0";

  try {
    const summary = await runRawValidationBatch({ limit, useAi });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[cron/validate-products]", e);
    return NextResponse.json({ error: "Validation batch failed" }, { status: 500 });
  }
}

export const maxDuration = 300;
