import { prisma } from "../db/prisma";
import type { ProductOffer, RetailerId } from "../types";

const EMA_ALPHA = 0.2;

export interface ProductRetailerStats {
  retailerId: RetailerId;
  channel: string;
  firstSeenPriceUsd?: number;
  firstSeenAt?: Date;
  lowestPriceUsd?: number;
  lowestPriceAt?: Date;
  movingAvgPriceUsd?: number;
  lastVerifiedPriceUsd?: number;
  lastVerifiedAt?: Date;
  verificationCount: number;
}

export async function loadProductRetailerStats(
  catalogId: string,
): Promise<Map<string, ProductRetailerStats>> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) return new Map();

  const rows = await prisma.productRetailerPriceStats.findMany({
    where: { productId: product.id },
  });

  const map = new Map<string, ProductRetailerStats>();
  for (const r of rows) {
    const key = `${r.retailerId}:${r.channel}`;
    map.set(key, {
      retailerId: r.retailerId as RetailerId,
      channel: r.channel,
      firstSeenPriceUsd: r.firstSeenPriceUsd ?? undefined,
      firstSeenAt: r.firstSeenAt ?? undefined,
      lowestPriceUsd: r.lowestPriceUsd ?? undefined,
      lowestPriceAt: r.lowestPriceAt ?? undefined,
      movingAvgPriceUsd: r.movingAvgPriceUsd ?? undefined,
      lastVerifiedPriceUsd: r.lastVerifiedPriceUsd ?? undefined,
      lastVerifiedAt: r.lastVerifiedAt ?? undefined,
      verificationCount: r.verificationCount,
    });
  }
  return map;
}

export async function recordVerifiedOfferStats(
  catalogId: string,
  offers: ProductOffer[],
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) return;

  const now = new Date();

  for (const offer of offers) {
    if (offer.price <= 0) continue;

    const existing = await prisma.productRetailerPriceStats.findUnique({
      where: {
        productId_retailerId_channel: {
          productId: product.id,
          retailerId: offer.retailer,
          channel: offer.channel,
        },
      },
    });

    const prevAvg = existing?.movingAvgPriceUsd ?? offer.price;
    const movingAvgPriceUsd =
      prevAvg * (1 - EMA_ALPHA) + offer.price * EMA_ALPHA;

    const lowestPriceUsd =
      existing?.lowestPriceUsd != null ?
        Math.min(existing.lowestPriceUsd, offer.price)
      : offer.price;
    const lowestPriceAt =
      existing?.lowestPriceUsd != null && offer.price >= existing.lowestPriceUsd ?
        existing.lowestPriceAt ?? now
      : now;

    await prisma.productRetailerPriceStats.upsert({
      where: {
        productId_retailerId_channel: {
          productId: product.id,
          retailerId: offer.retailer,
          channel: offer.channel,
        },
      },
      create: {
        productId: product.id,
        retailerId: offer.retailer,
        channel: offer.channel,
        firstSeenPriceUsd: offer.price,
        firstSeenAt: offer.priceAsOf ? new Date(offer.priceAsOf) : now,
        lowestPriceUsd: offer.price,
        lowestPriceAt: now,
        movingAvgPriceUsd: offer.price,
        lastVerifiedPriceUsd: offer.price,
        lastVerifiedAt: offer.priceAsOf ? new Date(offer.priceAsOf) : now,
        verificationCount: 1,
      },
      update: {
        lowestPriceUsd,
        lowestPriceAt,
        movingAvgPriceUsd,
        lastVerifiedPriceUsd: offer.price,
        lastVerifiedAt: offer.priceAsOf ? new Date(offer.priceAsOf) : now,
        verificationCount: (existing?.verificationCount ?? 0) + 1,
      },
    });
  }
}
