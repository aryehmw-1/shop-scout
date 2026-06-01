import type { ProxyProvider, ProxySelection } from "./proxy-provider";
import {
  isValidProxyUrl,
  pickProxyUrl,
  proxyUrlPool,
} from "../../offers/retailer-adapters/retailer-fetch";
import { shouldUseProxyForRetailer } from "../../offers/retailer-adapters/fetch-profiles";
import type { RetailerId } from "../../types";

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Direct HTTP with optional rotating residential proxy pool from env. */
export class DirectProxyProvider implements ProxyProvider {
  readonly name = "direct";

  isConfigured(): boolean {
    return proxyUrlPool().length > 0;
  }

  pickProxy(input: {
    retailerId: string;
    seed?: string;
    preferProxy?: boolean;
  }): ProxySelection {
    const retailerId = input.retailerId as RetailerId;
    const wantProxy =
      input.preferProxy ??
      shouldUseProxyForRetailer(retailerId);

    if (!wantProxy || !this.isConfigured()) {
      return { mode: "direct", provider: this.name };
    }

    const url = pickProxyUrl(input.seed);
    if (!url || !isValidProxyUrl(url)) {
      return { mode: "direct", provider: this.name };
    }

    const pool = proxyUrlPool();
    const mode = pool.length > 1 ? ("rotating" as const) : ("residential" as const);
    return { url, mode, provider: this.name };
  }
}

let defaultProvider: ProxyProvider | null = null;

export function getDefaultProxyProvider(): ProxyProvider {
  if (!defaultProvider) defaultProvider = new DirectProxyProvider();
  return defaultProvider;
}

/** Test hook — inject a custom provider (residential vendor, browser session, etc.). */
export function setDefaultProxyProvider(provider: ProxyProvider): void {
  defaultProvider = provider;
}

export function listConfiguredProxyEndpoints(): string[] {
  return parseList(process.env.INDEX_PROXY_LIST).filter(isValidProxyUrl);
}
