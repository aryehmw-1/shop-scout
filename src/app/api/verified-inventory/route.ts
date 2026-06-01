import { NextResponse } from "next/server";
import {
  loadVerifiedInventoryBrowse,
  type VerifiedBrowseMode,
} from "@/lib/inventory/verified-inventory-browse";

const MODES = new Set<VerifiedBrowseMode>(["all", "qa_approved", "persisted"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("mode") ?? "all";
  const mode = MODES.has(raw as VerifiedBrowseMode) ? (raw as VerifiedBrowseMode) : "all";

  const result = await loadVerifiedInventoryBrowse(mode);
  return NextResponse.json(result);
}
