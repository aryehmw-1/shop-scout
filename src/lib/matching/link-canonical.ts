import { prisma } from "../db/prisma";
import { findProductIdByIdentifier } from "../db/identity-store";
import { titleSimilarity } from "../catalog/title-similarity";
import { identifiersExactMatch, mergeIdentifiers } from "../identity/product-identifiers";
import { normalizeAttributes } from "../identity/normalize-attributes";
import { CATALOG, findCatalogMatchByTitle, type CatalogItem } from "../retailers/catalog";
import type { ProductIdentifiers } from "../identity/types";
import type { ParsedLinkVariant } from "./link-variant-parse";
import { variantAttributesConflict } from "./link-variant-parse";

export type LinkMatchTier = "exact" | "near" | "family" | "none";

export interface LinkCanonicalResult {
  catalogItem?: CatalogItem;
  catalogId?: string;
  matchTier: LinkMatchTier;
  matchConfidence: number;
  equivalenceReasons: string[];
  variantWarning?: string;
}

async function resolveCatalogItemByProductId(productId: string): Promise<CatalogItem | undefined> {
  const row = await prisma.product.findUnique({
    where: { id: productId },
    select: { catalogId: true },
  });
  if (!row) return undefined;
  return CATALOG.find((c) => c.id === row.catalogId);
}

export async function resolveLinkCanonicalProduct(input: {
  title: string;
  brand?: string;
  category?: string;
  identifiers: ProductIdentifiers;
  variant: ParsedLinkVariant;
  referencePrice: number;
}): Promise<LinkCanonicalResult> {
  const reasons: string[] = [];
  let catalogItem: CatalogItem | undefined;
  let matchTier: LinkMatchTier = "none";
  let matchConfidence = 0.35;

  const idTypes = ["gtin", "upc", "ean", "asin", "mpn"] as const;
  for (const type of idTypes) {
    const raw = input.identifiers[type];
    if (!raw) continue;
    const productId = await findProductIdByIdentifier(type, raw);
    if (productId) {
      catalogItem = await resolveCatalogItemByProductId(productId);
      if (catalogItem) {
        matchTier = type === "asin" || type === "upc" || type === "gtin" ? "exact" : "near";
        matchConfidence = type === "upc" || type === "gtin" ? 0.97 : 0.9;
        reasons.push(`Matched via ${type.toUpperCase()}`);
        break;
      }
    }
  }

  if (!catalogItem && input.identifiers.upc) {
    catalogItem = CATALOG.find((c) => c.upc === input.identifiers.upc);
    if (catalogItem) {
      matchTier = "exact";
      matchConfidence = 0.95;
      reasons.push("Matched via catalog UPC");
    }
  }

  if (!catalogItem) {
    const titleMatch = findCatalogMatchByTitle(input.title);
    if (titleMatch) {
      const sim = titleSimilarity(input.title, `${titleMatch.brand} ${titleMatch.title}`);
      if (sim >= 0.72) {
        catalogItem = titleMatch;
        matchTier = sim >= 0.88 ? "near" : "family";
        matchConfidence = sim;
        reasons.push(
          sim >= 0.88 ?
            "Matched via normalized title (high similarity)"
          : "Matched via title similarity (same product family)",
        );
      }
    }
  }

  if (!catalogItem) {
    return {
      matchTier: "none",
      matchConfidence: 0.25,
      equivalenceReasons: ["No canonical catalog match — using link title only"],
    };
  }

  const catalogIds = mergeIdentifiers({ upc: catalogItem.upc });
  const observedIds = mergeIdentifiers(input.identifiers);
  const idCheck = identifiersExactMatch(catalogIds, observedIds);
  if (idCheck.match && !reasons.some((r) => r.includes("UPC") || r.includes("GTIN"))) {
    matchTier = "exact";
    matchConfidence = Math.max(matchConfidence, 0.96);
    reasons.push(idCheck.reason ?? "Identifier exact match");
  }

  const catalogVariant = normalizeAttributes({
    brand: catalogItem.brand,
    size: catalogItem.size,
    category: catalogItem.category,
  });

  const catalogParsed = {
    color: catalogVariant.colorNormalized,
    size: catalogVariant.sizeNormalized,
    packCount: undefined as number | undefined,
    volumeOz: undefined as number | undefined,
    storageGb: undefined as number | undefined,
  };
  const conflict = variantAttributesConflict(input.variant, catalogParsed);
  let variantWarning: string | undefined;
  if (conflict.conflict) {
    variantWarning = conflict.reason;
    matchConfidence = Math.min(matchConfidence, 0.55);
    if (matchTier === "exact") matchTier = "near";
    reasons.push(`Low-confidence variant: ${conflict.reason}`);
  } else if (input.variant.color || input.variant.size) {
    reasons.push("Variant attributes align with catalog row");
  }

  const titleSim = titleSimilarity(input.title, `${catalogItem.brand} ${catalogItem.title}`);
  if (titleSim >= 0.85 && matchTier !== "exact") {
    matchConfidence = Math.max(matchConfidence, titleSim * 0.95);
  }

  return {
    catalogItem,
    catalogId: catalogItem.id,
    matchTier,
    matchConfidence: Math.round(matchConfidence * 1000) / 1000,
    equivalenceReasons: reasons,
    variantWarning,
  };
}
