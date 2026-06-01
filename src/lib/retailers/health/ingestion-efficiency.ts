import type { RetailerId } from "../../types";

interface RetailerIngestionStats {
  requests: number;
  successes: number;
  blocked: number;
  proxyRequests: number;
  bytes: number;
  latencyTotalMs: number;
  productKeys: Set<string>;
}

const memory = new Map<RetailerId, RetailerIngestionStats>();

function row(retailerId: RetailerId): RetailerIngestionStats {
  const existing = memory.get(retailerId);
  if (existing) return existing;
  const created: RetailerIngestionStats = {
    requests: 0,
    successes: 0,
    blocked: 0,
    proxyRequests: 0,
    bytes: 0,
    latencyTotalMs: 0,
    productKeys: new Set<string>(),
  };
  memory.set(retailerId, created);
  return created;
}

export function recordIngestionAttempt(input: {
  retailerId: RetailerId;
  productKey: string;
  ok: boolean;
  blocked?: boolean;
  viaProxy: boolean;
  bytes: number;
  latencyMs: number;
}): void {
  const stats = row(input.retailerId);
  stats.requests += 1;
  if (input.ok) stats.successes += 1;
  if (input.blocked) stats.blocked += 1;
  if (input.viaProxy) stats.proxyRequests += 1;
  stats.bytes += Math.max(0, input.bytes);
  stats.latencyTotalMs += Math.max(0, input.latencyMs);
  if (input.productKey) stats.productKeys.add(input.productKey);
}

export function ingestionEfficiencySummary(): {
  perRetailer: Array<{
    retailerId: RetailerId;
    requests: number;
    successes: number;
    successRate: number;
    blockedPct: number;
    proxyFallbackPct: number;
    avgKbPerRequest: number;
    avgRequestsPerProduct: number;
    avgLatencyMs: number;
  }>;
  totals: {
    requests: number;
    successes: number;
    products: number;
    bytes: number;
    avgKbPerProduct: number;
    avgRequestsPerProduct: number;
    nightlyGbEstimate: number;
    monthlyGbEstimate: number;
  };
} {
  const perRetailer = [...memory.entries()].map(([retailerId, s]) => {
    const products = Math.max(1, s.productKeys.size);
    return {
      retailerId,
      requests: s.requests,
      successes: s.successes,
      successRate: s.requests > 0 ? Math.round((s.successes / s.requests) * 1000) / 10 : 0,
      blockedPct: s.requests > 0 ? Math.round((s.blocked / s.requests) * 1000) / 10 : 0,
      proxyFallbackPct:
        s.requests > 0 ? Math.round((s.proxyRequests / s.requests) * 1000) / 10 : 0,
      avgKbPerRequest:
        s.requests > 0 ? Math.round((s.bytes / s.requests / 1024) * 100) / 100 : 0,
      avgRequestsPerProduct: Math.round((s.requests / products) * 100) / 100,
      avgLatencyMs: s.requests > 0 ? Math.round(s.latencyTotalMs / s.requests) : 0,
    };
  });

  const totalsRaw = perRetailer.reduce(
    (acc, r) => {
      acc.requests += r.requests;
      acc.successes += r.successes;
      const source = memory.get(r.retailerId)!;
      acc.products += source.productKeys.size;
      acc.bytes += source.bytes;
      return acc;
    },
    { requests: 0, successes: 0, products: 0, bytes: 0 },
  );

  const products = Math.max(1, totalsRaw.products);
  const bytesPerNight = totalsRaw.bytes || 0;

  return {
    perRetailer,
    totals: {
      ...totalsRaw,
      avgKbPerProduct: Math.round((totalsRaw.bytes / products / 1024) * 100) / 100,
      avgRequestsPerProduct: Math.round((totalsRaw.requests / products) * 100) / 100,
      nightlyGbEstimate: Math.round((bytesPerNight / (1024 ** 3)) * 1000) / 1000,
      monthlyGbEstimate: Math.round((bytesPerNight * 30 / (1024 ** 3)) * 1000) / 1000,
    },
  };
}
