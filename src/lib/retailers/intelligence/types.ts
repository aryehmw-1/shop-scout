import type { RetailerId } from "../../types";
import type { RetailerPageAdapter } from "../../offers/retailer-adapters/types";

/** How we fetch pages for a retailer. */
export type FetchStrategy =
  | "direct_http"
  | "rotating_proxy"
  | "browser_session"
  | "api_backed";

/** Reusable extraction strategy — not one-off per retailer forever. */
export type ExtractionStrategy =
  | "json_ld"
  | "next_data"
  | "react_hydration"
  | "static_html"
  | "shopify_json"
  | "api_fallback"
  | "adapter_custom";

export type AntiBotLevel = "low" | "medium" | "high" | "cloudflare";

export interface RetailerCapabilities {
  searchParse: boolean;
  pdpParse: boolean;
  linkIngest: boolean;
  apiFallback: boolean;
  proxyRequired: boolean;
  antiBot: AntiBotLevel;
}

export interface RetailerIntelligenceProfile {
  retailerId: RetailerId;
  displayName: string;
  fetchStrategy: FetchStrategy;
  /** Ordered extraction strategies — first match wins. */
  extractionStrategies: ExtractionStrategy[];
  capabilities: RetailerCapabilities;
  /** Default trust when no EMA history exists. */
  trustPrior: number;
  adapter?: RetailerPageAdapter;
  /** Hostnames for URL classification. */
  hostnames: string[];
}

export interface ExtractionContext {
  retailerId: RetailerId;
  html: string;
  finalUrl: string;
  urlKind: "search" | "pdp" | "unknown";
}

export interface ExtractionStrategyHandler {
  id: ExtractionStrategy;
  /** Lower = try first when profile lists this strategy. */
  priority: number;
  canHandle(ctx: ExtractionContext): boolean;
  extract(ctx: ExtractionContext): import("../../offers/retailer-adapters/types").RetailerSearchHit | null;
}

export interface FetchTransportRequest {
  url: string;
  retailerId: RetailerId;
  seed?: string;
  timeoutMs?: number;
}

export interface FetchTransportResult {
  html: string;
  finalUrl: string;
  status: number;
  proxyUsed: boolean;
  transport: FetchStrategy;
}

export interface FetchTransport {
  readonly strategy: FetchStrategy;
  fetch(request: FetchTransportRequest): Promise<FetchTransportResult>;
}
