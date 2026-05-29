# Pipeline verification

## Quick test

```bash
cd ~/Shop_Scout
npm run db:purge-estimates
PIPELINE_DEBUG=1 NEXT_PUBLIC_OFFER_DEBUG=1 npm run dev
```

Search **jeans slim** twice — verified section should be stable.

```bash
npm run verify:pipeline
# or
DATABASE_URL="file:./prisma/data/shop-scout.db" PIPELINE_DEBUG=1 npx tsx scripts/verify-pipeline-search.ts
```

## DB evidence (jeans-slim)

After `npm run db:purge-estimates` on a populated DB:

- **Purged:** 4010 rows (`catalog_estimate`, `daily_index`, `nightly_index`, `cached_quote`)
- **Cache read:** only `scraped` + `connector_api` (`cached-quotes.ts`)
- **Index write:** `catalog_estimate` | `scraped` | `connector_api` (`offer-rows.ts`)

Example row shapes:

| source | retailer | priceUsd | imageUrl | notes |
|--------|----------|----------|----------|-------|
| `catalog_estimate` | walmart | ~40 | null | pre-scrape estimate (not used in search cache) |
| `scraped` | walmart | ~14 | `https://i5.walmartimages.com/...` | post PDP scrape |

## Ranking

`rankOffersForDisplay` sorts **verified before estimated** always, then score, then price.

`prepareResultsForDisplay` returns:

- `online` — verified only (scraped + connector_api + PDP + price > 0)
- `estimatedOnline` — everything else (never mixed)

## Images

1. PDP HTML → `extractProductImageFromHtml` (JSON-LD / OG / retailer CDN)
2. Meta/OG from `retailer-page-extract`
3. Catalog hero (`imageForProduct`)
4. Retailer logo placeholder (`retailerLogoFallbackUrl`)

Previously identical: shared Unsplash/catalog hero + empty `imageUrl` on listings.

## Debug UI

Set `NEXT_PUBLIC_OFFER_DEBUG=1` for per-card pipeline inspect panel + console `[offer-inspect]` logs.

Badges on each card:

- **VERIFIED LIVE PRICE**
- **ESTIMATED PRICE**
- **PRICE UNAVAILABLE**
- **SCRAPED N min ago**

## URL validation

`VALIDATE_OFFER_URLS=1` — HEAD/follow, HTTP 200, retailer domain, canonical PDP.

Shop links use **`productUrl`** (not affiliate) to avoid broken tracking redirects.
