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
```

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
