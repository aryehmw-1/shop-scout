import { validateProductionConfig } from "@/lib/commerce-intelligence/ops/production-config";
import {
  intelligenceJsonResponse,
  withIntelligenceApi,
} from "@/lib/commerce-intelligence/ops/api-guard";

export const dynamic = "force-dynamic";

export const GET = withIntelligenceApi(
  ({ requestId }) => {
    const config = validateProductionConfig();
    return intelligenceJsonResponse(
      {
        ok: config.valid,
        status: config.valid ? "healthy" : "degraded",
        environment: config.environment,
        warnings: config.warnings,
        errors: config.errors,
        deploymentDefaults: config.deploymentDefaults,
        deterministicCore: true,
      },
      requestId,
      { status: config.valid ? 200 : 503 },
    );
  },
  { rateLimit: 120, namespace: "health" },
);
