export type ProxyRouteMode = "direct" | "residential" | "rotating" | "browser_session";

export interface ProxySelection {
  url?: string;
  mode: ProxyRouteMode;
  provider: string;
}

/**
 * Lightweight proxy abstraction — only "direct" is fully wired today.
 * Plug residential/rotating providers later without rewriting retailer-fetch.
 */
export interface ProxyProvider {
  readonly name: string;
  isConfigured(): boolean;
  pickProxy(input: {
    retailerId: string;
    seed?: string;
    preferProxy?: boolean;
  }): ProxySelection;
}
