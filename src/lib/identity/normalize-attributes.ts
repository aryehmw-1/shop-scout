import { normalizeColor, normalizeSizeLabel } from "../catalog/size-normalize";
import { canonicalizeBrand } from "./normalize-brand";
import type { NormalizedAttributes } from "./types";

const CATEGORY_ALIASES: Record<string, string> = {
  apparel: "clothing",
  clothes: "clothing",
  footwear: "shoes",
  sneaker: "shoes",
  sneakers: "shoes",
  grocery: "pantry",
  produce: "produce",
  bedding: "bedding",
  mattress: "bedding",
};

export function normalizeCategory(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? key;
}

export function normalizeGender(
  raw: string | undefined,
): string | undefined {
  if (!raw?.trim()) return undefined;
  const lower = raw.toLowerCase();
  if (/\b(men|mens|male|boys?)\b/.test(lower) && !/\bwomen/.test(lower)) {
    return "mens";
  }
  if (/\b(women|womens|female|ladies|girls?)\b/.test(lower)) {
    return "womens";
  }
  if (/\b(kids?|children|youth|toddler|baby)\b/.test(lower)) {
    return "kids";
  }
  return undefined;
}

export function normalizeAttributes(input: {
  brand?: string;
  color?: string;
  size?: string;
  gender?: string;
  category?: string;
}): NormalizedAttributes {
  return {
    brandRaw: input.brand?.trim() || undefined,
    brandCanonical: canonicalizeBrand(input.brand),
    colorNormalized: input.color ? normalizeColor(input.color) : undefined,
    sizeNormalized: input.size ? normalizeSizeLabel(input.size) : undefined,
    gender: normalizeGender(input.gender),
    category: normalizeCategory(input.category),
  };
}

export function attributeOverlapScore(
  expected: NormalizedAttributes,
  observed: NormalizedAttributes,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let hits = 0;
  let checks = 0;

  if (expected.brandCanonical && observed.brandCanonical) {
    checks += 1;
    if (expected.brandCanonical === observed.brandCanonical) {
      hits += 1;
      reasons.push("same brand");
    }
  }
  if (expected.colorNormalized && observed.colorNormalized) {
    checks += 1;
    if (expected.colorNormalized === observed.colorNormalized) {
      hits += 1;
      reasons.push("same color");
    }
  }
  if (expected.sizeNormalized && observed.sizeNormalized) {
    checks += 1;
    if (expected.sizeNormalized === observed.sizeNormalized) {
      hits += 1;
      reasons.push("same normalized size");
    }
  }
  if (expected.gender && observed.gender) {
    checks += 1;
    if (expected.gender === observed.gender) {
      hits += 1;
      reasons.push("same gender");
    }
  }

  const score = checks === 0 ? 0.5 : hits / checks;
  return { score, reasons };
}
