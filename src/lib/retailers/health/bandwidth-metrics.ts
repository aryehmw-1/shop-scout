import type { RetailerId } from "../../types";

interface BandwidthRow {
  requests: number;
  bytes: number;
  proxyRequests: number;
  proxyBytes: number;
  directRequests: number;
  directBytes: number;
  errors: number;
  lastUpdatedAt: string;
}

const memory = new Map<RetailerId, BandwidthRow>();

export function recordBandwidth(
  retailerId: RetailerId,
  input: { bytes: number; viaProxy: boolean; ok: boolean },
): void {
  const row = memory.get(retailerId) ?? {
    requests: 0,
    bytes: 0,
    proxyRequests: 0,
    proxyBytes: 0,
    directRequests: 0,
    directBytes: 0,
    errors: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
  row.requests += 1;
  row.bytes += Math.max(0, input.bytes);
  if (input.viaProxy) {
    row.proxyRequests += 1;
    row.proxyBytes += Math.max(0, input.bytes);
  } else {
    row.directRequests += 1;
    row.directBytes += Math.max(0, input.bytes);
  }
  if (!input.ok) row.errors += 1;
  row.lastUpdatedAt = new Date().toISOString();
  memory.set(retailerId, row);
}

export function getBandwidthMetrics(retailerId: RetailerId): BandwidthRow | undefined {
  return memory.get(retailerId);
}

export function listBandwidthMetrics(): Array<{ retailerId: RetailerId } & BandwidthRow> {
  return [...memory.entries()].map(([retailerId, row]) => ({ retailerId, ...row }));
}
