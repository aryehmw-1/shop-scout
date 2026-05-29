# Price history (5 years)

Shop Scout stores **one price observation per product, per store, per day** in `PriceHistorySnapshot`. Older than **5 years** is deleted automatically. That keeps the database small while still supporting multi-year forecasts.

This is **not** deal-finding. It answers: *based on past prices we have stored, what is today’s price likely to be?*

## Storage design (easy to keep for 5 years)

| Choice | Why |
|--------|-----|
| **SQLite locally** | Zero setup; fine for dev and small catalogs. |
| **PostgreSQL on Vercel/Railway** | Use in production when you outgrow SQLite (`DATABASE_URL=postgresql://...`). |
| **One row per day per store** | Nightly + searches dedupe by UTC day — you do not store 100 duplicate rows for the same Tuesday. |
| **URLs only, no image blobs** | History rows are tiny (~80 bytes each). |
| **Auto-prune** | Anything older than 5 years is removed on each write. |

### Rough size

Example: **70 products × 7 retailers × 365 days × 5 years ≈ 900k rows** → on the order of **50–100 MB**. That is easy for SQLite or Postgres.

## How data gets into the DB

### 1. Build it yourself (free, legitimate) — recommended baseline

```bash
# Every night (cron at 2am)
npm run index:nightly

# Optional: only shoes, limit batch size
npm run index:nightly -- --category=shoes --limit=80
```

Each run saves today’s grid into `PriceQuote` **and** appends daily snapshots to `PriceHistorySnapshot`. After ~5 years of cron you have 5 years of history without buying anything.

User searches also append snapshots (when `skipPersist` is false).

### 2. Amazon — real prices today + history from a provider

| Method | What you get |
|--------|----------------|
| **Amazon PA-API** (`AMAZON_PA_API_*`) | **Today’s** Amazon price + image. No 5-year backfill. |
| **Keepa** (paid API) | Years of Amazon price history per ASIN. Export → CSV → import (below). |
| **Rainforest / similar** | Current Amazon data; some plans include history. |

PA-API rows are saved into history going forward each night/search.

### 3. Bulk import from CSV

For backfill (Keepa export, old backups, partner feed):

```bash
# Products must exist in DB first (run one search or nightly index once)
npm run import:history -- data/price-history.example.csv
node scripts/import-price-history.mjs data/my-keepa-export.csv --dry-run
```

**CSV format** (header row required):

```text
catalog_id,retailer_id,channel,price_usd,observed_at,source
salad-spinach,walmart,online,2.49,2023-06-01T12:00:00Z,import
```

- `catalog_id` must match your catalog (`src/lib/retailers/catalog.ts`).
- `retailer_id`: `amazon`, `walmart`, `target`, `nike`, etc.
- `observed_at`: ISO date (`2024-01-15` or full ISO time).
- Duplicate **same product + store + UTC day** are skipped.

See `data/price-history.example.csv`.

### 4. Browser extension (forward-looking)

When users visit a product page, the extension can POST a price to your API. That builds history for SKUs people actually view. Disclose this in Privacy / Affiliate pages.

### 5. Retailer affiliate feeds (best for Walmart/Target)

Official product feeds or affiliate APIs (Impact, CJ, etc.) often include **current** price. Some partners provide **historical** files. Same pipeline: map to catalog → CSV import or nightly job.

We do **not** use bot/scraper farms to backfill 5 years — unstable and often against site terms.

## What we do with stored history

1. **Predict** — for each product + retailer with **≥ 3** points: weighted recent average + 90-day trend.
2. **Display** — `priceSource: historical_model`, note e.g. *“Forecast from 120 prices (2.1y history)”*.
3. **Override** — live Amazon PA-API (`connector_api`) wins when configured.

## You do not have 5 years on day one

The schema **retains** 5 years once you have it. On a new install you only have:

- Data from first `index:nightly`
- User searches
- Anything you **import**

Until history builds, UI falls back to **catalog estimates** (labeled honestly).

**Fastest legitimate bootstrap:**

1. Run `npm run index:nightly` daily (cron).
2. Add Amazon PA-API keys for real Amazon rows now.
3. Import Amazon history from Keepa (or similar) for ASINs you care about.
4. Move production DB to Postgres before the table grows large.

## Disable the forecast model

```bash
PRICE_HISTORY_MODEL=off
```

## Not checkout-accurate

Forecasts are statistical. Users should confirm on the retailer site before buying.
