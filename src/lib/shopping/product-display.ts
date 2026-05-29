const GENDER_WORDS = new Set([
  "mens",
  "men",
  "men's",
  "womens",
  "women",
  "women's",
  "male",
  "female",
  "boys",
  "girls",
  "kids",
  "toddler",
]);

const GENERIC_SIZES = new Set(["1 unit", "one size", "each"]);

/** Brand must not be a gender/department word (avoids "mens" as brand). */
export function isGenericBrandToken(word: string): boolean {
  return GENDER_WORDS.has(word.toLowerCase().replace(/['']/g, ""));
}

export function isSyntheticSize(size: string | undefined): boolean {
  if (!size?.trim()) return true;
  return GENERIC_SIZES.has(size.trim().toLowerCase());
}

/** "mens pants joggers" → "Men's Jogger Pants" */
export function formatSearchProductTitle(query: string): string {
  const lower = query.toLowerCase().trim();
  const parts: string[] = [];

  if (/\bmens?\b|\bmen'?s\b/.test(lower)) parts.push("Men's");
  else if (/\bwomens?\b|\bwomen'?s\b/.test(lower)) parts.push("Women's");
  else if (/\bboys?\b/.test(lower)) parts.push("Boys'");
  else if (/\bgirls?\b/.test(lower)) parts.push("Girls'");

  const typeWords: string[] = [];
  if (/joggers?/.test(lower)) typeWords.push("Jogger");
  if (/chinos?|khakis/.test(lower)) typeWords.push("Chino");
  if (/jeans|denim/.test(lower)) typeWords.push("Jeans");
  if (/hoodie|sweatshirt/.test(lower)) typeWords.push("Hoodie");
  if (/sweaters?|cardigans?/.test(lower)) typeWords.push("Sweater");
  if (/sneakers?|running\s+shoes?/.test(lower)) typeWords.push("Sneakers");
  if (/dress\s+pants|slacks/.test(lower)) typeWords.push("Dress");
  if (/\bpants\b/.test(lower) && !typeWords.some((w) => /jogger|chino|dress|jean/i.test(w))) {
    typeWords.push("Pants");
  }
  if (/shorts/.test(lower)) typeWords.push("Shorts");
  if (/leggings/.test(lower)) typeWords.push("Leggings");
  if (/mattress/.test(lower)) typeWords.push("Mattress");
  if (/\bbeds?\b/.test(lower) && !typeWords.length) typeWords.push("Bed");

  if (typeWords.length) {
    const last = typeWords[typeWords.length - 1]!;
    const plural =
      last === "Pants" || last === "Jeans" || last === "Shorts" || last === "Leggings" ?
        last
      : `${last}s`;
    parts.push(plural);
  } else {
    const tokens = lower
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !GENDER_WORDS.has(w.replace(/['']/g, "")) &&
          w !== "pack" &&
          !/^\d+$/.test(w) &&
          !/^op\d+$/i.test(w),
      );
    if (tokens.length) {
      parts.push(
        tokens
          .slice(0, 4)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      );
    } else {
      parts.push("Product");
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function brandAlreadyInTitle(brand: string, title: string): boolean {
  if (!brand?.trim() || brand === "Various brands") return true;
  const b = brand.toLowerCase().split(/\s+/)[0] ?? "";
  const t = title.toLowerCase();
  return t.includes(brand.toLowerCase()) || (b.length > 2 && t.includes(b));
}

export function formatStoreListingTitle(
  item: { brand: string; title: string; size: string },
  retailerName: string,
  retailerStyle: "prefix" | "plain" | "brand-first" = "plain",
): string {
  const title = item.title.trim();
  const brand =
    isGenericBrandToken(item.brand) || item.brand === "Various brands" ?
      ""
    : item.brand.trim();
  const showSize = !isSyntheticSize(item.size);
  const sizePart = showSize ? item.size.replace(/^men'?s\s+/i, "Men's ").replace(/^women'?s\s+/i, "Women's ") : "";

  let core = title;
  if (brand && !brandAlreadyInTitle(brand, title)) {
    core = retailerStyle === "brand-first" ? `${brand} ${title}` : `${brand} — ${title}`;
  }

  if (retailerStyle === "prefix") {
    return showSize ? `${retailerName}: ${core}, ${sizePart}` : `${retailerName}: ${core}`;
  }
  return showSize ? `${core}, ${sizePart}` : core;
}
