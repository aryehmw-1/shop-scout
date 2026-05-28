import type {
  ClothingAgeGroup,
  ClothingGender,
  LearningProfile,
  ProductOffer,
  ShoppingIntent,
} from "../types";
import { parseQueryAttributes } from "../retailers/search";

export function emptyLearningProfile(): LearningProfile {
  return {
    version: 1,
    updatedAt: Date.now(),
    searchCount: 0,
    genderAffinity: { mens: 0, womens: 0, neutral: 0 },
    ageAffinity: { toddler: 0, kids: 0, adult: 0 },
    categoryAffinity: {},
    retailerAffinity: {},
    recentQueries: [],
  };
}

function bump(map: Record<string, number>, key: string, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Learn from a search the user ran */
export function recordSearch(
  profile: LearningProfile,
  intent: ShoppingIntent,
): LearningProfile {
  const next = { ...profile, updatedAt: Date.now(), searchCount: profile.searchCount + 1 };
  const attrs = parseQueryAttributes(intent.query);
  const gender = intent.gender ?? attrs.gender;
  const ageGroup = intent.ageGroup ?? attrs.ageGroup;

  if (gender === "mens") bump(next.genderAffinity, "mens", 2);
  else if (gender === "womens") bump(next.genderAffinity, "womens", 2);
  else bump(next.genderAffinity, "neutral");

  if (ageGroup === "toddler") bump(next.ageAffinity, "toddler", 2);
  else if (ageGroup === "kids") bump(next.ageAffinity, "kids", 2);
  else if (ageGroup === "adult") bump(next.ageAffinity, "adult");

  if (intent.category) {
    bump(next.categoryAffinity, intent.category, 2);
  }

  const q = normalizeQuery(intent.query);
  if (q) {
    const recent = [q, ...profile.recentQueries.filter((r) => r !== q)].slice(0, 24);
    next.recentQueries = recent;
  }

  return next;
}

/** Learn when user saves or clicks a product */
export function recordProductInteraction(
  profile: LearningProfile,
  offer: ProductOffer,
): LearningProfile {
  const next = { ...profile, updatedAt: Date.now() };
  bump(next.retailerAffinity, offer.retailer, 3);

  const blob = `${offer.title} ${offer.brand} ${offer.size}`.toLowerCase();
  if (/\bmen|mens|male\b/.test(blob) && !/\bwomen/.test(blob)) bump(next.genderAffinity, "mens", 2);
  else if (/\bwomen|womens|ladies\b/.test(blob)) bump(next.genderAffinity, "womens", 2);
  if (/\btoddler|baby|infant|2t|3t|4t\b/.test(blob)) bump(next.ageAffinity, "toddler", 2);
  else if (/\bkids?|children|youth|boys|girls\b/.test(blob)) bump(next.ageAffinity, "kids", 2);

  return next;
}

export function mergeLearningProfiles(
  a?: LearningProfile | null,
  b?: LearningProfile | null,
): LearningProfile {
  if (!a && !b) return emptyLearningProfile();
  if (!a) return b!;
  if (!b) return a;

  const merged = emptyLearningProfile();
  merged.searchCount = a.searchCount + b.searchCount;
  merged.updatedAt = Math.max(a.updatedAt, b.updatedAt);
  merged.recentQueries = [...new Set([...a.recentQueries, ...b.recentQueries])].slice(0, 24);

  for (const key of ["mens", "womens", "neutral"] as const) {
    merged.genderAffinity[key] = (a.genderAffinity[key] ?? 0) + (b.genderAffinity[key] ?? 0);
  }
  for (const key of ["toddler", "kids", "adult"] as const) {
    merged.ageAffinity[key] = (a.ageAffinity[key] ?? 0) + (b.ageAffinity[key] ?? 0);
  }

  const catKeys = new Set([
    ...Object.keys(a.categoryAffinity),
    ...Object.keys(b.categoryAffinity),
  ]);
  for (const k of catKeys) {
    merged.categoryAffinity[k as keyof typeof merged.categoryAffinity] =
      (a.categoryAffinity[k as keyof typeof a.categoryAffinity] ?? 0) +
      (b.categoryAffinity[k as keyof typeof b.categoryAffinity] ?? 0);
  }

  const retKeys = new Set([
    ...Object.keys(a.retailerAffinity),
    ...Object.keys(b.retailerAffinity),
  ]);
  for (const k of retKeys) {
    merged.retailerAffinity[k as keyof typeof merged.retailerAffinity] =
      (a.retailerAffinity[k as keyof typeof a.retailerAffinity] ?? 0) +
      (b.retailerAffinity[k as keyof typeof b.retailerAffinity] ?? 0);
  }

  return merged;
}

/** Score boost from learned preferences (0–18) */
export function learningBoost(
  profile: LearningProfile | undefined,
  item: { category: string; title: string; brand: string; keywords: string[] },
  retailer: string,
): number {
  if (!profile || profile.searchCount < 1) return 0;

  let boost = 0;
  const blob = `${item.title} ${item.brand} ${item.keywords.join(" ")}`.toLowerCase();

  const topGender = (
    Object.entries(profile.genderAffinity) as [ClothingGender | "neutral", number][]
  ).sort((a, b) => b[1] - a[1])[0];
  if (topGender && topGender[1] >= 3 && topGender[0] !== "neutral") {
    if (topGender[0] === "mens" && /\bmen|mens|male\b/.test(blob)) boost += 6;
    if (topGender[0] === "womens" && /\bwomen|womens|ladies\b/.test(blob)) boost += 6;
  }

  const topAge = (
    Object.entries(profile.ageAffinity) as [ClothingAgeGroup, number][]
  ).sort((a, b) => b[1] - a[1])[0];
  if (topAge && topAge[1] >= 3) {
    if (topAge[0] === "toddler" && /\btoddler|baby|infant|2t|3t|4t\b/.test(blob)) boost += 6;
    if (topAge[0] === "kids" && /\bkids?|children|youth\b/.test(blob)) boost += 5;
    if (topAge[0] === "adult" && !/\btoddler|baby|infant|kids?|children|youth\b/.test(blob))
      boost += 3;
  }

  const catBoost = profile.categoryAffinity[item.category as keyof typeof profile.categoryAffinity];
  if (catBoost && catBoost >= 4) boost += 4;

  const retBoost =
    profile.retailerAffinity[retailer as keyof typeof profile.retailerAffinity];
  if (retBoost && retBoost >= 3) boost += Math.min(8, retBoost);

  return Math.min(18, boost);
}

/** Suggest gender/age when user omits them but we have strong history */
export function inferFromLearning(
  profile: LearningProfile | undefined,
  query: string,
): { gender?: ClothingGender; ageGroup?: ClothingAgeGroup } {
  if (!profile || profile.searchCount < 2) return {};
  const attrs = parseQueryAttributes(query);
  if (attrs.gender || attrs.ageGroup) return {};

  const g = Object.entries(profile.genderAffinity).sort((a, b) => b[1] - a[1])[0];
  const a = Object.entries(profile.ageAffinity).sort((a, b) => b[1] - a[1])[0];

  const out: { gender?: ClothingGender; ageGroup?: ClothingAgeGroup } = {};
  if (g && g[1] >= 6 && g[0] !== "neutral") out.gender = g[0] as ClothingGender;
  if (a && a[1] >= 6) out.ageGroup = a[0] as ClothingAgeGroup;
  return out;
}
