import { intelligenceRecommend } from "@/lib/commerce-intelligence/service/intelligence-api";
import {
  intelligenceErrorResponse,
  intelligenceJsonResponse,
  withIntelligenceApi,
} from "@/lib/commerce-intelligence/ops/api-guard";

export const dynamic = "force-dynamic";

export const GET = withIntelligenceApi(
  ({ req, requestId }) => {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return intelligenceErrorResponse(
        "missing_query",
        "Provide ?q= search query",
        requestId,
        400,
      );
    }

    const result = intelligenceRecommend(query, { query });
    return intelligenceJsonResponse(result, requestId);
  },
  { rateLimit: 120, namespace: "recommend" },
);
