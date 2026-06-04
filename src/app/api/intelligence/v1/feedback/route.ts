import { recordServerBehavioralEvent } from "@/lib/commerce-intelligence/feedback/server-store";
import {
  intelligenceErrorResponse,
  intelligenceJsonResponse,
  withIntelligenceApi,
} from "@/lib/commerce-intelligence/ops/api-guard";
import type { RetailerId } from "@/lib/types";
import type { TrustMemoryEventType } from "@/lib/commerce-intelligence/trust-memory/types";

export const dynamic = "force-dynamic";

const ALLOWED: TrustMemoryEventType[] = ["click", "save", "ignore", "reversal"];

export const POST = withIntelligenceApi(
  async ({ req, requestId }) => {
    let body: { type?: string; retailer?: string; canonicalId?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return intelligenceErrorResponse("invalid_json", "Invalid JSON body", requestId, 400);
    }

    const type = body.type as TrustMemoryEventType | undefined;
    const retailer = body.retailer as RetailerId | undefined;
    if (!type || !retailer || !ALLOWED.includes(type)) {
      return intelligenceErrorResponse(
        "invalid_payload",
        "Invalid feedback payload",
        requestId,
        400,
      );
    }

    const store = recordServerBehavioralEvent({
      type,
      retailer,
      canonicalId: body.canonicalId,
    });

    return intelligenceJsonResponse({ ok: true, updatedAt: store.updatedAt }, requestId);
  },
  { rateLimit: 200, namespace: "feedback" },
);
