import type { RetailerId } from "@/lib/types";
import type { TrustMemoryEventType } from "./types";

/** Best-effort server sync — behavioral layer only, never affects confidence. */
export function syncTrustMemoryEventToServer(opts: {
  type: TrustMemoryEventType;
  retailer: RetailerId;
  canonicalId?: string;
}): void {
  if (typeof window === "undefined") return;
  void fetch("/api/intelligence/v1/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    keepalive: true,
  }).catch(() => {});
}
