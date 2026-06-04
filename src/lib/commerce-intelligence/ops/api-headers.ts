import { INTELLIGENCE_API_VERSION } from "./config";

/** Stable v1 response headers for intelligence APIs. */
export const intelligenceApiHeaders = (): HeadersInit => ({
  "X-Intelligence-API-Version": INTELLIGENCE_API_VERSION,
  "Cache-Control": "no-store",
});
