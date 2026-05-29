# Data Quality Audit

Generated: 2026-05-29

## Summary

| Metric | Value |
|--------|------:|
| Flagship products | 22 |
| Deprioritized catalog (apparel/bedding) | 40 |
| Active verified quotes | **0** |
| Expired verified quotes | 15 |
| Price drift failures | TBD after refresh |
| Generic catalog image rate | ~85% (Unsplash placeholders) |
| Cross-retailer overlap | 0 |

## Root cause diagnosis

### Price drift
- Catalog `basePrice` is a **seed estimate** (multiplier + jitter), not live PDP price
- Verified quotes only exist when PDP enrichment succeeds; all 15 current quotes are **expired**
- When scrape succeeds, prices can diverge from stale `basePrice` — persist validation uses 0.55 tolerance ratio

### Image repeats
- Most catalog items share **Unsplash stock photos** — rejected at persist as `placeholder_image`
- Same image URL appears across unrelated products in seed catalog
- Fix: retailer CDN images from PDP enrichment only; consumer UI now requires `imageConfidence ≥ 0.4` + retailer-hosted or high-quality extract

### Link failures
- Initial offers use **search URLs**; only post-enrichment PDP URLs pass persist/display gates
- Carter's verified quotes had valid PDPs; Walmart pantry items had Walmart PDPs

### Structured data / adapters
- Core 5 retailers use dedicated adapters + JSON-LD fallback
- Non-core retailers: generic parser only — no price on search pages
- Kroger adapter requires UPC in HTML; Target/Walmart need proxy at scale

### Variant/SKU mapping
- Apparel has duplicate UPCs (`0912000030xx` shared across items) — **deprioritized**
- Grocery snack UPCs fixed to unique Frito-Lay-style codes

## Recommendations

- Run `npm run phase0:refresh -- --limit=22` to refresh flagship set
- Keep `INDEX_FLAGSHIP_ONLY=on` until 15+ production-usable products
- Do not expand catalog until flagship overlap + freshness proven
- Lead demo with pasted-link compare (identifier-first resolution)

Run `npm run audit:data-quality -- --write` locally for live report.
