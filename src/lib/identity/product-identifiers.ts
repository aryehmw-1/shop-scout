import type { ProductIdentifierType, ProductIdentifiers } from "./types";

/** Strip check digits punctuation; keep digits for GTIN family. */
export function normalizeIdentifier(
  type: ProductIdentifierType,
  raw: string | undefined | null,
): string | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim();
  switch (type) {
    case "upc":
    case "gtin":
    case "ean": {
      const digits = v.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 14) return undefined;
      return digits;
    }
    case "asin": {
      const m = v.match(/\b([A-Z0-9]{10})\b/i);
      return m?.[1]?.toUpperCase();
    }
    case "mpn":
    case "manufacturerPartNumber":
    case "sku": {
      const clean = v.replace(/\s+/g, " ").trim();
      if (clean.length < 2 || clean.length > 64) return undefined;
      return clean.toUpperCase();
    }
    default:
      return undefined;
  }
}

export function mergeIdentifiers(
  ...parts: Array<ProductIdentifiers | undefined>
): ProductIdentifiers {
  const out: ProductIdentifiers = {};
  for (const p of parts) {
    if (!p) continue;
    if (p.upc) out.upc = p.upc;
    if (p.gtin) out.gtin = p.gtin;
    if (p.ean) out.ean = p.ean;
    if (p.mpn) out.mpn = p.mpn;
    if (p.manufacturerPartNumber) out.manufacturerPartNumber = p.manufacturerPartNumber;
    if (p.asin) out.asin = p.asin;
    if (p.sku) out.sku = p.sku;
  }
  return out;
}

export function identifiersFromRecord(
  record: Partial<Record<string, string | undefined>> | ProductIdentifiers,
): ProductIdentifiers {
  return mergeIdentifiers({
    upc: normalizeIdentifier("upc", record.upc),
    gtin: normalizeIdentifier("gtin", record.gtin ?? record.ean),
    ean: normalizeIdentifier("ean", record.ean),
    mpn: normalizeIdentifier("mpn", record.mpn),
    manufacturerPartNumber: normalizeIdentifier(
      "manufacturerPartNumber",
      record.manufacturerPartNumber,
    ),
    asin: normalizeIdentifier("asin", record.asin),
    sku: normalizeIdentifier("sku", record.sku),
  });
}

export function primaryGtinFamily(id: ProductIdentifiers): string | undefined {
  return id.gtin ?? id.ean ?? id.upc;
}

export function identifiersExactMatch(
  a: ProductIdentifiers,
  b: ProductIdentifiers,
): { match: boolean; reason?: string } {
  const pairs: Array<[ProductIdentifierType, string | undefined, string | undefined]> = [
    ["gtin", a.gtin, b.gtin],
    ["ean", a.ean, b.ean],
    ["upc", a.upc, b.upc],
    ["mpn", a.mpn, b.mpn],
    ["manufacturerPartNumber", a.manufacturerPartNumber, b.manufacturerPartNumber],
    ["asin", a.asin, b.asin],
  ];

  for (const [, left, right] of pairs) {
    if (left && right && left === right) {
      return { match: true, reason: "same UPC/GTIN" };
    }
  }
  return { match: false };
}

export function extractIdentifiersFromJsonLd(
  node: Record<string, unknown>,
): ProductIdentifiers {
  const sku = typeof node.sku === "string" ? node.sku : undefined;
  const gtin =
    typeof node.gtin === "string" ? node.gtin
    : typeof node.gtin13 === "string" ? node.gtin13
    : typeof node.gtin12 === "string" ? node.gtin12
    : undefined;
  const mpn =
    typeof node.mpn === "string" ? node.mpn
    : typeof node.manufacturerPartNumber === "string" ?
      node.manufacturerPartNumber
    : undefined;
  return identifiersFromRecord({ sku, gtin, mpn });
}
