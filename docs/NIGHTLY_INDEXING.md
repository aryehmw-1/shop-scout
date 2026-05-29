# Nightly price indexing

The other AI’s advice matches how serious comparison sites work: **collect overnight, serve from cache all day**.

Shop Scout already had pieces of this (`PriceQuote` in SQLite, `LIVE_PRICING_PROVIDER=cache`). This adds a **scheduled indexer** that fills that cache before users arrive.

## What it does

1. **Delete** expired `PriceQuote` rows (past `expiresAt`).
2. **Walk the catalog** (optionally one category, e.g. `shoes`).
3. For each product, build the compare grid (catalog + **Amazon PA-API** when configured).
4. **Save** every store row to `PriceQuote` with `source: nightly_index` (Amazon live rows stay `connector_api`).
5. Set **`expiresAt`** to **midnight** (start of next local day).

During the day, searches use `LIVE_PRICING_PROVIDER=cache` and read those rows — **no live API calls** per user (except Amazon if cache miss and PA-API still enabled in live path).

## Run manually

```bash
npm run index:nightly
npm run index:nightly -- --category=shoes --limit=80
INDEX_FETCH_RETAILER_IMAGES=true npm run index:full:local -- --limit=3
```

### Why it looks “stuck” at 3% CPU

The job is **I/O bound**, not CPU bound:

1. **`ensureCatalogSynced()`** — syncs all ~70 catalog products to SQLite (hundreds of sequential `upsert`s). **No product logs until this finishes.** Can take several minutes.
2. **`INDEX_FETCH_RETAILER_IMAGES=true`** — per product, up to **8 HTTP fetches** to retailer PDPs (~12s timeout each) + **variant-group** fetches. Full index can take **hours**.
3. **Openverse / Open Food Facts** — optional network when hero images are weak.
4. **Amazon PA-API** — one request per product when configured.

### Progress logging (added)

Logs use `[nightly-index …]` (always) and `[index HH:MM:SS] …` (detail, on by default):

```bash
INDEX_PROGRESS=off npm run index:full:local   # quieter
SKIP_CATALOG_SYNC=1 npm run index:full:local  # skip DB catalog mirror if already synced
```

### Faster test run

```bash
INDEX_FETCH_RETAILER_IMAGES=off npm run index:full:local -- --limit=5
```

### PDP enrichment quality (index with images on)

- Picks **8 retailers by relevance** (Walmart, Target, grocery chains, etc.) — not the 8 cheapest rows (which were often Shein, TJ Maxx, kids brands).
- **Does not trust prices** scraped from search/list URLs (fixes Gerber $2195, Forever21 $1999 noise).
- **Skips slow retailers by default:** `costco`, `kroger`, and `hm` (12s timeouts). Override with `INDEX_SCRAPE_SKIP_RETAILERS=none` or a custom list.
- **Retailer adapters:** Walmart, Target, Amazon (+ PA-API fallback), Aldi, Kroger, Costco. See [RETAILER_ADAPTERS.md](./RETAILER_ADAPTERS.md). Audit: `npm run audit:adapters`. Smoke: `npm run test:adapters`.
- **Amazon on local machine:** set `INDEX_PROXY_LIST` for residential proxies, `INDEX_USER_AGENT_POOL` to rotate UAs, and PA-API keys for `INDEX_AMAZON_PAAPI_FALLBACK` when HTML is blocked.
- Loop logs **`progress`** with ETA after each product.

`retailerImagesFetched: 0` in logs is normal for products **without** `variantGroups`; check `offerEnrichment.imagesFetched` instead.

## Cron example (Mac/Linux)

```cron
0 2 * * * cd /path/to/Pantry_Scout && npm run index:nightly -- --category=shoes >> /tmp/shop-scout-nightly.log 2>&1
```

Production: use **GitHub Actions scheduled workflow**, **Railway cron**, **Vercel cron** + API route, or a small VPS with `cron`.

## Do you need zero APIs?

**No.** Overnight batching saves **money and speed**; it does **not** create prices from nothing.

| Data | Nightly job source |
|------|-------------------|
| **Amazon** | Amazon PA-API (official) |
| **Walmart, Target, Nike, …** | Today: **catalog estimates** stored as `nightly_index` (same numbers, precomputed) |
| **Real multi-store prices** | Need each retailer’s **affiliate API** or an **approved feed** — or scraping (not recommended) |

Scraping Nike/Walmart at 2 AM is still scraping (ToS, blocks, maintenance). Batching only spreads the risk; it doesn’t make it legal or stable.

## Honest labels

- `connector_api` + “Live price · Amazon” = from PA-API  
- `nightly_index` = precomputed for the day (mostly catalog estimates until more APIs exist)  

## Phase 2 ideas

- Hot queries refreshed every 2h; cold catalog every 24h  
- `SearchCache` table keyed by query + zip  
- UPC/GTIN matching across retailers  
- Historical price chart from retained snapshots (don’t delete — archive)  
