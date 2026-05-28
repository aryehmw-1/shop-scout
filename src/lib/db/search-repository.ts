import { prisma } from "./prisma";
import type { ProductSearchResults, ShoppingIntent } from "../types";
import type { ResolvedProduct, SearchExecutionMeta } from "../search/types";

export async function persistSearchSession(input: {
  userId?: string;
  zipCode: string;
  queryRaw: string;
  intent: ShoppingIntent;
  mode: string;
  results: ProductSearchResults;
  resolved: ResolvedProduct;
  durationMs: number;
}): Promise<string> {
  const allOffers = [...input.results.local, ...input.results.online];
  const best = allOffers.sort((a, b) => a.landedCost - b.landedCost)[0];

  const session = await prisma.searchSession.create({
    data: {
      userId: input.userId ?? null,
      zipCode: input.zipCode,
      queryRaw: input.queryRaw,
      intentJson: JSON.stringify(input.intent),
      mode: input.mode,
      resultCount: allOffers.length,
      bestPriceUsd: best?.landedCost,
      durationMs: input.durationMs,
      queries: {
        create: {
          resolvedCatalogId: input.resolved.catalogId,
          queryNormalized: input.intent.query,
          attributesJson: JSON.stringify({
            gender: input.intent.gender,
            ageGroup: input.intent.ageGroup,
            brand: input.intent.brand,
            colors: input.intent.colors,
            size: input.intent.size,
            category: input.intent.category,
          }),
          offerCount: allOffers.length,
        },
      },
    },
  });

  return session.id;
}

export async function persistPriceQuotes(
  catalogId: string,
  offers: ProductSearchResults,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
  });
  if (!product) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const rows = [...offers.local, ...offers.online].slice(0, 80);

  await prisma.priceQuote.createMany({
    data: rows.map((o) => ({
      productId: product.id,
      retailerId: o.retailer,
      channel: o.channel,
      storeTitle: o.storeTitle ?? o.title ?? null,
      imageUrl: o.imageUrl?.startsWith("https://") ? o.imageUrl : null,
      priceUsd: o.price,
      wasPriceUsd: o.wasPrice ?? null,
      landedCostUsd: o.landedCost,
      unitPriceUsd: o.unitPrice,
      inStock: o.inStock,
      matchConfidence: o.matchConfidence,
      source: o.priceSource ?? "catalog_model",
      productUrl: o.productUrl,
      affiliateUrl: o.affiliateUrl,
      fetchedAt: o.priceAsOf ? new Date(o.priceAsOf) : now,
      expiresAt: o.priceExpiresAt ? new Date(o.priceExpiresAt) : expiresAt,
    })),
  });
}

export async function recordLearningEvent(
  userId: string | undefined,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.learningEvent.create({
    data: {
      userId: userId ?? null,
      kind,
      payloadJson: JSON.stringify(payload),
    },
  });
}

export function attachMeta(
  results: ProductSearchResults,
  meta: SearchExecutionMeta,
): ProductSearchResults & { meta: SearchExecutionMeta } {
  return { ...results, meta };
}
