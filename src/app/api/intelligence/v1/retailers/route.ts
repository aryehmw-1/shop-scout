import { NextResponse } from "next/server";
import {
  intelligenceRetailerProfile,
  intelligenceRetailerProfiles,
} from "@/lib/commerce-intelligence/service/intelligence-api";
import type { RetailerId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const retailer = searchParams.get("retailer") as RetailerId | null;
  if (retailer) {
    const profile = intelligenceRetailerProfile(retailer);
    if (!profile) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ profile });
  }
  return NextResponse.json({ profiles: intelligenceRetailerProfiles() });
}
