import { prisma } from "../db/prisma";
import { ownDbHistoryDays } from "../own-db/config";
import type { ProductSearchResults } from "../types";

const MAX_SNAPSHOTS_PER_RETAILER = 60;

function historyRetentionMs(): number {
  return ownDbHistoryDays() * 24 * 60 * 60 * 1000;
}

function utcDayStart(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** Store today's observed prices + photo URLs (daily job or first search of the day). */
export async function recordPriceSnapshots(
  catalogId: string,
  results: ProductSearchResults,
  source: string,
): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) return 0;

  const now = new Date();
  const dayStart = utcDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const offers = [...results.local, ...results.online];
  if (!offers.length) return 0;

  const existingToday = await prisma.priceHistorySnapshot.findMany({
    where: {
      productId: product.id,
      observedAt: { gte: dayStart, lt: dayEnd },
    },
    select: { retailerId: true, channel: true },
  });
  const seen = new Set(
    existingToday.map((r) => `${r.retailerId}:${r.channel}`),
  );

  const toInsert = offers
    .filter((o) => !seen.has(`${o.retailer}:${o.channel}`))
    .map((o) => ({
      productId: product.id,
      retailerId: o.retailer,
      channel: o.channel,
      priceUsd: o.price,
      storeTitle: o.storeTitle ?? o.title ?? null,
      imageUrl:
        o.imageUrl?.startsWith("https://") ? o.imageUrl : null,
      source,
      observedAt: o.priceAsOf ? new Date(o.priceAsOf) : now,
    }));

  if (toInsert.length) {
    await prisma.priceHistorySnapshot.createMany({ data: toInsert });
  }

  const variantLinks = await prisma.productVariant.findFirst({
    where: { productId: product.id, isDefault: true },
    select: { id: true, variantGroupId: true },
  });

  await prisma.priceHistory.createMany({
    data: offers.map((o) => ({
      productId: product.id,
      variantGroupId: variantLinks?.variantGroupId ?? null,
      variantId: variantLinks?.id ?? null,
      retailerId: o.retailer,
      channel: o.channel,
      observedPrice: o.price,
      availability: o.inStock,
      source,
      storeTitle: o.storeTitle ?? o.title ?? null,
      imageUrl: o.imageUrl?.startsWith("https://") ? o.imageUrl : null,
      matchConfidence: o.matchConfidence ?? null,
      identityConfidence: o.identityConfidence ?? null,
      confidenceReasonsJson: JSON.stringify(o.confidenceReasons ?? []),
      observedAt: o.priceAsOf ? new Date(o.priceAsOf) : now,
    })),
  });

  await pruneOldHistoryForProduct(product.id);

  const hero = offers.find((o) => o.imageUrl?.startsWith("https://"));
  if (hero?.imageUrl) {
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl: hero.imageUrl },
    });
  }

  return toInsert.length;
}

export async function pruneOldHistoryForProduct(productId: string): Promise<void> {
  const cutoff = new Date(Date.now() - historyRetentionMs());
  await prisma.priceHistorySnapshot.deleteMany({
    where: { productId, observedAt: { lt: cutoff } },
  });
  await prisma.priceHistory.deleteMany({
    where: { productId, observedAt: { lt: cutoff } },
  });
}

export interface HistoryPoint {
  priceUsd: number;
  observedAt: Date;
  source: string;
  imageUrl?: string | null;
  storeTitle?: string | null;
}

function historyKey(retailerId: string, channel: string): string {
  return `${retailerId}:${channel}`;
}

/** All observations in the retention window (default 30 days). */
export async function loadAllPriceHistory(
  catalogId: string,
): Promise<Map<string, HistoryPoint[]>> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) return new Map();

  const cutoff = new Date(Date.now() - historyRetentionMs());
  const rows = await prisma.priceHistory.findMany({
    where: {
      productId: product.id,
      observedAt: { gte: cutoff },
    },
    orderBy: { observedAt: "asc" },
  });

  const byKey = new Map<string, HistoryPoint[]>();
  for (const r of rows) {
    const key = historyKey(r.retailerId, r.channel);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = [];
      byKey.set(key, bucket);
    }
    if (bucket.length >= MAX_SNAPSHOTS_PER_RETAILER) continue;
    bucket.push({
      priceUsd: r.observedPrice,
      observedAt: r.observedAt,
      source: r.source,
      imageUrl: r.imageUrl,
      storeTitle: r.storeTitle,
    });
  }
  return byKey;
}

export async function loadPriceHistory(
  catalogId: string,
  retailerId: string,
  channel = "online",
): Promise<HistoryPoint[]> {
  const all = await loadAllPriceHistory(catalogId);
  return all.get(historyKey(retailerId, channel)) ?? [];
}

export async function loadPriceSparklines(
  catalogId: string,
): Promise<Map<string, number[]>> {
  const all = await loadAllPriceHistory(catalogId);
  const map = new Map<string, number[]>();
  for (const [key, points] of all) {
    const prices = points.slice(-7).map((p) => p.priceUsd);
    if (prices.length >= 2) map.set(key, prices);
  }
  return map;
}
