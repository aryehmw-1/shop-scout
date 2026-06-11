import { NextResponse } from "next/server";
import {
  getBrightDataClient,
  isBrightDataConfigured,
} from "@/lib/pipeline/bright-data-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bright-data/test
 * Verifies that BRIGHT_DATA_API_KEY is set and that the key can authenticate
 * against the Bright Data API. Never returns the key itself. All failures are
 * also logged server-side with the `[bright-data]` prefix for Vercel log search.
 */
export async function GET() {
  if (!isBrightDataConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        detail:
          "BRIGHT_DATA_API_KEY is not set. Add it to .env.local locally and to Vercel env vars, then redeploy.",
      },
      { status: 200 },
    );
  }

  const client = getBrightDataClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, configured: false, detail: "Bright Data client unavailable." },
      { status: 200 },
    );
  }

  const result = await client.ping();
  return NextResponse.json({ configured: true, ...result }, { status: 200 });
}
