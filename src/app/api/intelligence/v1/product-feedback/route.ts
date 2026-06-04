import { recordProductFeedback, type WhyNotReason } from "@/lib/commerce-intelligence/feedback/product-feedback";
import { attachFeedbackToSession } from "@/lib/commerce-intelligence/session-replay/store";
import {
  intelligenceErrorResponse,
  intelligenceJsonResponse,
  withIntelligenceApi,
} from "@/lib/commerce-intelligence/ops/api-guard";

export const dynamic = "force-dynamic";

const WHY: WhyNotReason[] = ["price", "wrong_product", "trust", "other"];

export const POST = withIntelligenceApi(
  async ({ req, requestId }) => {
    let body: {
      sessionId?: string;
      cohort?: string;
      canonicalId?: string;
      useful?: boolean;
      bought?: boolean;
      explanationHelpful?: boolean;
      whyNot?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return intelligenceErrorResponse("invalid_json", "Invalid JSON", requestId, 400);
    }

    if (body.whyNot && !WHY.includes(body.whyNot as WhyNotReason)) {
      return intelligenceErrorResponse("invalid_payload", "Invalid whyNot", requestId, 400);
    }

    recordProductFeedback({
      sessionId: body.sessionId?.slice(0, 64),
      cohort: body.cohort?.slice(0, 32),
      canonicalId: body.canonicalId?.slice(0, 128),
      useful: body.useful,
      bought: body.bought,
      explanationHelpful: body.explanationHelpful,
      whyNot: body.whyNot as WhyNotReason | undefined,
    });

    if (body.sessionId) {
      attachFeedbackToSession(body.sessionId, body.canonicalId, {
        useful: body.useful,
        bought: body.bought,
        explanationHelpful: body.explanationHelpful,
        whyNot: body.whyNot,
      });
    }

    return intelligenceJsonResponse({ ok: true }, requestId);
  },
  { rateLimit: 120, namespace: "product-feedback" },
);
