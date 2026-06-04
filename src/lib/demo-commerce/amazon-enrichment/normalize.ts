/** Normalize a product title for Amazon search and cache keys. */
export function normalizeEnrichmentTitle(title: string, brand?: string): string {
  let t = title
    .replace(/\s+/g, " ")
    .replace(/\b(compare at|—|-)\s*\w+$/i, "")
    .trim();

  const b = brand?.trim();
  if (b && !isGenericBrand(b) && !t.toLowerCase().includes(b.toLowerCase())) {
    t = `${b} ${t}`;
  }

  return t.slice(0, 160);
}

export function enrichmentCacheKey(title: string, brand?: string): string {
  const norm = normalizeEnrichmentTitle(title, brand)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const brandPart = (brand ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 24);
  return brandPart ? `${brandPart}|${norm}` : norm;
}

function isGenericBrand(brand: string): boolean {
  return /^(generic|unknown|n\/a|store brand)$/i.test(brand.trim());
}

export function buildDisplayTitle(
  candidate: { title: string; brand?: string; size?: string },
  amazonTitle?: string,
): string {
  const base = amazonTitle?.trim() || candidate.title.trim();
  const size = candidate.size?.trim();
  if (size && !base.toLowerCase().includes(size.toLowerCase())) {
    return `${base} — ${size}`.slice(0, 280);
  }
  return base.slice(0, 280);
}
