# Shop Scout Operational Audit

Generated: 2026-05-29T16:20:52.054Z

> Honest production readiness — catalog entries ≠ production-usable products.

## 1. Product coverage inventory

| Metric | Count | % of catalog |
|--------|------:|-------------:|
| Total catalog products | 67 | 100% |
| Canonical catalog IDs | 67 | 100% |
| With active verified offers | 0 | 0.0% |
| Expired verified (needs re-index) | 12 | 17.9% |
| Estimated only (no verified) | 1 | 1.5% |
| Zero usable offers | 54 | 80.6% |
| Stale verified (>48h) | 0 | 0.0% |
| High-confidence matching (≥0.8) | 0 | 0.0% |
| **Production-usable** | **0** | **0.0%** |

### By category

| Category | Catalog | Verified | Est. only | Zero | Stale | High conf | Prod-usable | Avg retailers |
|----------|--------:|---------:|----------:|-----:|------:|----------:|------------:|--------------:|
| clothing | 22 | 0 | 2 | 20 | 0 | 0 | 0 | 0.0 |
| shoes | 14 | 0 | 0 | 14 | 0 | 0 | 0 | 0.0 |
| pantry | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0.0 |
| salad | 5 | 0 | 0 | 5 | 0 | 0 | 0 | 0.0 |
| dairy | 5 | 0 | 0 | 5 | 0 | 0 | 0 | 0.0 |
| bedding | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0.0 |
| produce | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0.0 |
| meat | 2 | 0 | 1 | 1 | 0 | 0 | 0 | 0.0 |
| sports | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0.0 |
| books | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0.0 |
| bakery | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0.0 |
| household | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0.0 |

## 2. Retailer reliability matrix

| Retailer | Class | Trust | Scrape | Parser | Image | Verified % | Latency | Verified quotes | Data |
|----------|-------|------:|-------:|-------:|------:|-----------:|--------:|----------------:|------|
| walmart | production-ready | 0.73 | 88% | 88% | 100% | 100% | — | 7 | quotes_inferred |
| carters | production-ready | 0.71 | 86% | 86% | 0% | 100% | — | 6 | quotes_inferred |
| amazon | usable-with-caveats | 0.60 | 67% | 67% | 100% | 100% | — | 2 | quotes_inferred |

## 3. Product quality grading

| Grade | Count | % |
|-------|------:|--:|
| A | 0 | 0.0% |
| B | 0 | 0.0% |
| unstable | 0 | 0.0% |
| unusable | 67 | 100.0% |

## 4. Scalability analysis

- **Current:** 67 products, 199 quote rows
- **Index runtime:** ~O(products × retailers × PDP_depth). 200 products × 5 retailers ≈ 15–45 min sequential
- **Scrape concurrency:** Sequential per product (~350ms delay) × 5 retailers × PDP fetch — ~2–8s/product
- **Anti-bot:** 0/3 retailers unstable/unusable without residential proxy

**Scales linearly:** Catalog Product rows; PriceHistory append observations; Search sessions / analytics events

**Scales poorly:** Live scrape fan-out per search (no queue); Nightly index without worker pool; Image fetch per offer on INDEX_FETCH_RETAILER_IMAGES=true; SQLite under concurrent search + index writes

**Redesign before expansion:**
- PostgreSQL + connection pooling for production
- Job queue for scrape/enrich (BullMQ/SQS) with per-retailer rate limits
- Residential proxy pool for Walmart/Target/Kroger/Costco
- Quote cache layer (Redis) with TTL aligned to verification tier
- Separate read replica or materialized search index for compare grid

## 5. Category viability

| Category | Products | Verified rate | Match qual | Scrape | Recommendation |
|----------|--------:|-------------:|-----------|--------|----------------|
| clothing | 22 | 0% | poor | poor | Defer until retailer reliability improves |
| shoes | 14 | 0% | poor | poor | Defer until retailer reliability improves |
| pantry | 7 | 0% | poor | poor | Defer until retailer reliability improves |
| salad | 5 | 0% | poor | poor | Defer until retailer reliability improves |
| dairy | 5 | 0% | poor | poor | Defer until retailer reliability improves |
| bedding | 4 | 0% | poor | poor | Defer until retailer reliability improves |
| produce | 2 | 0% | poor | poor | Defer until retailer reliability improves |
| meat | 2 | 0% | poor | poor | Defer until retailer reliability improves |
| sports | 2 | 0% | poor | poor | Defer until retailer reliability improves |
| books | 2 | 0% | poor | poor | Defer until retailer reliability improves |
| bakery | 1 | 0% | poor | poor | Defer until retailer reliability improves |
| household | 1 | 0% | poor | poor | Defer until retailer reliability improves |

## 6. Exact matching audit

- Products with UPC: 67
- Products with GTIN: 67
- Identifier rows: 112
- Exact matches (≥0.92): 0
- Similar (0.7–0.92): 2
- Low confidence (<0.7): 13
- Exact match rate: 0%
- Avg match confidence: 0.56

### Architecture
- **upcGtin:** 67/67 products have UPC; 112 identifier rows in ProductIdentifier
- **titleNormalization:** query-normalize.ts + formatSearchProductTitle at display
- **brandExtraction:** BrandCanonical table + brandCanonical on Product
- **sizeParsing:** Catalog sizeLabel + variant size rows
- **colorParsing:** VariantGroup.colorNormalized
- **duplicateDetection:** RetailerProductIdentity unique (retailerId, productUrl); ASIN dedup in amazon-validation
- **canonicalIdentity:** Product.catalogId unique slug; resolveCatalogRow for variants
- **variantResolution:** VariantGroup → ProductVariant via resolve-variant.ts

## 7. Top 20 production-ready products

*No A/B-grade products meet demo-ready criteria yet.*

## 8. Worst 20 products

| Rank | Catalog ID | Grade | Score | Verified | Issues |
|-----:|------------|-------|------:|---------:|--------|
| 1 | spinach-og-10 | unusable | 0 | 0 | Zero usable offers |
| 2 | spring-mix-5 | unusable | 0 | 0 | Zero usable offers |
| 3 | romaine-hearts-3 | unusable | 0 | 0 | Zero usable offers |
| 4 | caesar-kit | unusable | 0 | 0 | Zero usable offers |
| 5 | arugula-og-5 | unusable | 0 | 0 | Zero usable offers |
| 6 | milk-whole-gal | unusable | 0 | 0 | Zero usable offers |
| 7 | milk-og-half | unusable | 0 | 0 | Zero usable offers |
| 8 | eggs-dozen | unusable | 0 | 0 | Zero usable offers |
| 9 | bread-wheat | unusable | 0 | 0 | Zero usable offers |
| 10 | bananas-bunch | unusable | 0 | 0 | Zero usable offers |
| 11 | pasta-spaghetti | unusable | 0 | 0 | Zero usable offers |
| 12 | butter-salted | unusable | 0 | 0 | Zero usable offers |
| 13 | coffee-ground | unusable | 0 | 0 | Zero usable offers |
| 14 | yogurt-greek | unusable | 0 | 0 | Zero usable offers |
| 15 | cereal-honey | unusable | 0 | 0 | Zero usable offers |
| 16 | paper-towels | unusable | 0 | 0 | Zero usable offers |
| 17 | ground-beef | unusable | 0 | 0 | Zero usable offers |
| 18 | oj-juice | unusable | 0 | 0 | Zero usable offers |
| 19 | nike-running-shoes | unusable | 0 | 0 | Zero usable offers |
| 20 | super-pretzel | unusable | 0 | 0 | Zero usable offers |

## 9. Operational analytics (24h)

- Searches: 0
- Clicks: 0
- Search→click CTR: —
- Avg enrichment latency: —
- Cache hit rate: —

## 10. Scaling roadmap

**Target:** 200 high-quality products

- Prioritize categories: salad, dairy, household, pantry
- Prioritize retailers: walmart, carters
- Avoid retailers: walmart, target, kroger, costco
- API required: amazon (PA-API fallback); costco (likely API or curated feeds)
- Scrape acceptable: amazon HTML adapter; aldi (lower bot pressure)
- Hybrid needed: walmart; target; kroger — proxy + API where available
- Human curation: Apparel/shoes variant disambiguation; Electronics MPN matching; Flagship demo product selection (top 20)

### Phase 0 — Truth baseline (now)
Goal: 0/67 production-usable today
- Run operational audit weekly
- Populate RetailerQualityMetric via index + search enrich
- Unset invalid INDEX_PROXY_LIST until real credentials

### Phase 1 — 50 flagship products
Goal: A-grade demo set with 3+ verified retailers each
- Curate top 20 from audit
- Fix worst 20 or remove from default catalog
- Amazon + 1–2 working scrape retailers per product

### Phase 2 — 100 products
Goal: Category expansion in easiest verticals only
- PostgreSQL migration
- Scrape job queue with retailer rate limits
- Proxy pool for blocked retailers

### Phase 3 — 200+ products
Goal: Quality-first catalog, not full CATALOG sync
- Human curation for apparel/electronics
- API partnerships where scrape ROI is negative
- Materialized compare snapshots per catalogId

## 11. Indexing pipeline walkthrough

## Full indexing pipeline (one product)

1. **Query normalization** — N/A at index time; intent built from catalog brand+title (`intentForCatalogItem`).
2. **Canonical resolution** — `resolveCatalogRow` picks variant group/size from catalog row.
3. **Retailer targeting** — Weekly rotation plan or full index selects retailersTonight (CORE: amazon,walmart,target,costco,kroger).
4. **Compare grid (estimates)** — `compareProduct` builds baseline offers from catalog listings.
5. **Amazon PA-API** — If configured, live quotes merged via `mergeLivePrices`.
6. **Image + PDP enrich** — `enrichIndexSearchResults`: retailer adapters fetch PDP, extract price/image.
7. **Validation** — `offer-persist-validation` + `amazon-validation`; rejected offers never persisted.
8. **Price history** — `finalizePricesWithHistory` writes snapshots + rolling stats.
9. **Persist** — `persistNightlySearchResults` writes validated rows to PriceQuote (source: daily_index).
10. **Caching** — Search reads PriceQuote via search-service cache (60min verified TTL).
11. **UI** — `prepareResultsForDisplay` ranks verified-only; Best Deal from deal-intelligence pipeline.
