import { NextResponse } from "next/server";
import { collectPlatformHealth } from "@/lib/ops/data-observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await collectPlatformHealth();
  return NextResponse.json(health);
}
