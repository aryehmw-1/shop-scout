import type { RetailerId } from "../types";
import type { ProxyMode } from "./proxy-routing";

interface RetailerProxyStats {
  routeSelections: number;
  directSelections: number;
  datacenterSelections: number;
  residentialSelections: number;
  retries: number;
  proxyFailures: number;
  timeoutFailures: number;
  fallbackToDirect: number;
  lastRouteMode?: ProxyMode;
  lastProxyEndpoint?: string;
  lastAttempt?: number;
  lastError?: string;
  updatedAt: string;
}

const memory = new Map<RetailerId, RetailerProxyStats>();

function row(retailerId: RetailerId): RetailerProxyStats {
  return (
    memory.get(retailerId) ?? {
      routeSelections: 0,
      directSelections: 0,
      datacenterSelections: 0,
      residentialSelections: 0,
      retries: 0,
      proxyFailures: 0,
      timeoutFailures: 0,
      fallbackToDirect: 0,
      updatedAt: new Date().toISOString(),
    }
  );
}

function save(retailerId: RetailerId, next: RetailerProxyStats): void {
  next.updatedAt = new Date().toISOString();
  memory.set(retailerId, next);
}

export function recordRouteSelection(retailerId: RetailerId, mode: ProxyMode): void {
  const next = row(retailerId);
  next.routeSelections += 1;
  if (mode === "direct") next.directSelections += 1;
  if (mode === "datacenter") next.datacenterSelections += 1;
  if (mode === "residential") next.residentialSelections += 1;
  next.lastRouteMode = mode;
  save(retailerId, next);
}

export function recordSelectedEndpoint(
  retailerId: RetailerId,
  endpoint: string | undefined,
  attempt: number,
): void {
  const next = row(retailerId);
  next.lastProxyEndpoint = endpoint;
  next.lastAttempt = attempt;
  save(retailerId, next);
}

export function recordProxyRetry(retailerId: RetailerId): void {
  const next = row(retailerId);
  next.retries += 1;
  save(retailerId, next);
}

export function recordProxyFailure(retailerId: RetailerId, reason: string): void {
  const next = row(retailerId);
  next.proxyFailures += 1;
  if (/timeout|aborted|AbortError|timed out/i.test(reason)) {
    next.timeoutFailures += 1;
  }
  next.lastError = reason.slice(0, 200);
  save(retailerId, next);
}

export function recordFallbackToDirect(retailerId: RetailerId): void {
  const next = row(retailerId);
  next.fallbackToDirect += 1;
  save(retailerId, next);
}

export function listProxyObservability(): Array<{ retailerId: RetailerId } & RetailerProxyStats> {
  return [...memory.entries()].map(([retailerId, stats]) => ({ retailerId, ...stats }));
}
