/** Real-time telemetry for nightly / full index jobs. */

import { formatDurationMs, indexLogAlways } from "./index-progress";

export interface IndexTelemetrySnapshot {
  progressPct: number;
  productsCompleted: number;
  productsTotal: number;
  productsWithOffers: number;
  productsZeroOffers: number;
  offersWritten: number;
  rejections: number;
  retries: number;
  retailersAttempted: number;
  elapsedMs: number;
  etaMs: number;
  avgProductMs: number;
  memoryMb: { rss: number; heapUsed: number; heapTotal: number };
  throughputProductsPerMin: number;
  currentCategory: string | null;
  categoryProgress: Record<string, { done: number; total: number }>;
  bottleneck: string;
}

let state: IndexTelemetrySnapshot | null = null;

function memMb(): IndexTelemetrySnapshot["memoryMb"] {
  const m = process.memoryUsage();
  return {
    rss: Math.round(m.rss / 1024 / 1024),
    heapUsed: Math.round(m.heapUsed / 1024 / 1024),
    heapTotal: Math.round(m.heapTotal / 1024 / 1024),
  };
}

export function initIndexTelemetry(productsTotal: number): void {
  state = {
    progressPct: 0,
    productsCompleted: 0,
    productsTotal,
    productsWithOffers: 0,
    productsZeroOffers: 0,
    offersWritten: 0,
    rejections: 0,
    retries: 0,
    retailersAttempted: 0,
    elapsedMs: 0,
    etaMs: 0,
    avgProductMs: 0,
    memoryMb: memMb(),
    throughputProductsPerMin: 0,
    currentCategory: null,
    categoryProgress: {},
    bottleneck: "starting",
  };
}

export function recordIndexProductResult(input: {
  category: string;
  offerCount: number;
  rejections?: number;
  retries?: number;
  retailersAttempted?: number;
  elapsedMs: number;
  productsDone: number;
  productsTotal: number;
  loopElapsedMs: number;
  bottleneck?: string;
}): void {
  if (!state) initIndexTelemetry(input.productsTotal);

  state!.productsCompleted = input.productsDone;
  state!.productsTotal = input.productsTotal;
  if (input.offerCount > 0) {
    state!.productsWithOffers += 1;
    state!.offersWritten += input.offerCount;
  } else {
    state!.productsZeroOffers += 1;
  }
  state!.rejections += input.rejections ?? 0;
  state!.retries += input.retries ?? 0;
  state!.retailersAttempted += input.retailersAttempted ?? 0;
  state!.elapsedMs = input.loopElapsedMs;
  state!.avgProductMs = input.loopElapsedMs / input.productsDone;
  state!.etaMs = state!.avgProductMs * (input.productsTotal - input.productsDone);
  state!.progressPct = Math.round((input.productsDone / input.productsTotal) * 100);
  state!.memoryMb = memMb();
  state!.throughputProductsPerMin =
    input.loopElapsedMs > 0 ?
      (input.productsDone / input.loopElapsedMs) * 60_000
    : 0;
  state!.currentCategory = input.category;

  const cat = state!.categoryProgress[input.category] ?? { done: 0, total: 0 };
  cat.done += 1;
  state!.categoryProgress[input.category] = cat;
  if (input.bottleneck) state!.bottleneck = input.bottleneck;

  emitTelemetry();
}

export function setCategoryTotals(categoryTotals: Record<string, number>): void {
  if (!state) return;
  for (const [cat, total] of Object.entries(categoryTotals)) {
    state.categoryProgress[cat] = { done: state.categoryProgress[cat]?.done ?? 0, total };
  }
}

export function getIndexTelemetry(): IndexTelemetrySnapshot | null {
  return state;
}

function emitTelemetry(): void {
  if (!state) return;
  indexLogAlways("telemetry", {
    progress: `${state.progressPct}%`,
    products: `${state.productsCompleted}/${state.productsTotal}`,
    offersWritten: state.offersWritten,
    zeroOffers: state.productsZeroOffers,
    rejections: state.rejections,
    retries: state.retries,
    elapsed: formatDurationMs(state.elapsedMs),
    eta: formatDurationMs(state.etaMs),
    avgProduct: formatDurationMs(state.avgProductMs),
    throughput: `${state.throughputProductsPerMin.toFixed(1)} products/min`,
    memoryMb: state.memoryMb,
    category: state.currentCategory,
    bottleneck: state.bottleneck,
  });
}

export function finalizeIndexTelemetry(): IndexTelemetrySnapshot | null {
  if (!state) return null;
  state.bottleneck = "complete";
  emitTelemetry();
  const final = { ...state };
  state = null;
  return final;
}
