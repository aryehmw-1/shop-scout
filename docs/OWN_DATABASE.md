# Shop Scout’s own price database

Shop Scout **builds its own database** instead of relying on third-party price feeds. Once per day it checks each product on the retailers you’ve added, saves **prices and photo URLs**, and serves those to users the rest of the day.

## How it works

```
Once per day (2 AM cron)
        ↓
  All ~64 catalog products every night
  + ~1/7 of retailers tonight (weekly rotation, default on)
        ↓
  After 7 nights → every product checked at every store once
        ↓
  For each product × tonight’s stores:
    · price (Amazon PA-API when configured, else catalog baseline)
    · product photo URL (HTTPS link)
    · store listing title
        ↓
  PriceQuote          → refreshed for tonight’s stores (valid ~8 days)
  PriceHistorySnapshot → one row per store per day (kept 30 days)
        ↓
User searches → read own DB; other stores show last week’s row or 30-day average
```

Set `WEEKLY_STORE_ROTATION=off` to index **all stores every night** (slower, like your first bootstrap run).

## Weekly rotation (default)

| Night | What runs |
|-------|-----------|
| Every night | All **64 catalog products** |
| Sunday | ~22 stores (Walmart, Nike, … — stable split) |
| Monday | ~22 different stores |
| … | … |
| Saturday | last ~22 stores |

Each store is assigned to a weekday by a stable hash, so the split stays even as you add retailers. Disable with `WEEKLY_STORE_ROTATION=off`.

## Tables

| Table | Purpose |
|-------|---------|
| **Product** | Canonical product identity (`brandCanonical`, UPC/GTIN, popularity signals) |
| **VariantGroup** | Color/style + one canonical image; confidence + image quality metadata |
| **ProductVariant** | Size SKUs under a group; optional per-size UPC/GTIN |
| **ProductIdentifier** | Normalized UPC/GTIN/MPN lookup index (exact match overrides semantic search) |
| **BrandCanonical** | Canonical brand strings + alias JSON |
| **RetailerProductIdentity** | Retailer listing separated from canonical product |
| **PriceQuote** | Retailer offer row with `matchConfidence`, `identityConfidence`, reasons JSON |
| **PriceHistory** | Append-only price observations (trends, volatility, charts) |
| **PriceHistorySnapshot** | Daily rollup per store (30-day averages; backward compatible) |

## Product identity & confidence

```
Retailer listing (RetailerProductIdentity)
        ↓ identifiers + brand normalization
Canonical Product → VariantGroup → ProductVariant
        ↓ scoreMatchConfidence()
PriceQuote / PriceHistory (with confidenceReasons)
```

**Scoring priority:** UPC/GTIN exact match → brand → variant color → size → title similarity.

**Commands:**

```bash
npm run db:push
npm run db:backfill-identity
```

Set `SEMANTIC_EMBEDDINGS=1` when wiring a real embedding model (stub stores a fingerprint vector today).

**Indexing depth:** products with higher `refreshPriority` / `searchFrequency` are indexed first each night; tail products are shuffled for fair coverage.

## Offer quality (nightly index)

The index now separates **search links** from **product detail pages (PDPs)** and scores trust honestly.

| Env | Default | Purpose |
|-----|---------|---------|
| `INDEX_FETCH_RETAILER_IMAGES` | on | Enables retailer page fetch + per-offer enrichment |
| `INDEX_OFFER_ENRICHMENT` | on (unless `off`) | Fetch up to 8 retailers/product for image/price/PDP |
| `INDEX_OFFER_ENRICH_MAX` | `8` | Max retailer page fetches per catalog product |
| `INDEX_OFFER_DIAGNOSTICS` | off | Log per-offer URL/image/price/confidence JSON |

**Why `retailerImagesFetched` was ~0:** variant-group image fetch only runs for products with `variantGroups` in catalog (e.g. Levi's jeans). Most SKUs use **per-offer enrichment** instead (`offerEnrichment.imagesFetched` in the index report).

**Price labels:**

- `scraped` — price read from retailer HTML/JSON-LD
- `connector_api` — Amazon PA-API (optional)
- `catalog_model` — estimated · always marked “verify at store”, never “best deal” unless verified

```bash
INDEX_OFFER_DIAGNOSTICS=1 INDEX_FETCH_RETAILER_IMAGES=true npm run index:full:local -- --limit=3
```

## Setup

### 1. First time — fill the database now

```bash
npm run bootstrap:db
```

That runs `db:push`, `db:seed`, then indexes **all ~64 catalog products** (prices + photo URLs). Takes about **1–2 minutes** locally.

### 2. Automatic daily run at 2 AM

**It does not run by itself on your laptop** unless you add cron. On **Vercel** it can run automatically after deploy.

#### Vercel (recommended for production)

1. Add env var **`CRON_SECRET`** (random string) in Vercel project settings.
2. Deploy — `vercel.json` triggers `/api/cron/daily-index` at **8:00 UTC** (~2 AM US Central).
3. Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically.

Nothing else to click daily.

#### Your Mac / Linux server

```bash
crontab -e
```

Add:

```cron
0 2 * * * cd /path/to/Pantry_Scout && npm run index:daily >> /tmp/shop-scout-daily.log 2>&1
```

#### Manual (any time)

```bash
npm run index:daily
```

## What users see

**Online-only mode (default):** one column — compare prices across stores online. Users click through to shop; pickup/in-store is on the retailer’s site.

| Situation | Label |
|-----------|--------|
| Today’s daily check ran | “Today’s price · checked once today” |
| Reading from DB between checks | “From our database · last daily check” |
| ≥3 days of history, no today row | “30-day average · from our daily checks” |
| Brand new product (<3 checks) | “Estimated price · verify at store” |

### Photos

Each daily row saves an **`imageUrl`** (HTTPS link to the product photo, not a file in the DB). The latest photo is reused until the next daily check updates it.

### ZIP codes

Prices are **not stored per ZIP**. Online compare uses the same national prices; shipping may vary by address on the retailer checkout. Storing every product × every store × every US ZIP is not practical — that is why **near-you** was removed by default (`ONLINE_ONLY=true`).

## Why 30 days is enough

Prices move slowly for groceries, shoes, etc. A **30-day rolling average** smooths noise and is honest about what we actually observed. You can raise retention:

```bash
PRICE_HISTORY_DAYS=90
```

## Product photos (variant-group level)

Images are stored as **HTTPS URLs only** (no binary files). They belong to a **VariantGroup** (color/style), not each size row.

```
Product → VariantGroup (Black) → sizes 32x32, 34x32, 36x32
              ↑
    canonicalImageUrl + retailerImageUrls JSON
```

**Display priority:** retailer-specific URL → canonical group image → catalog fallback.

**Index behavior:**

1. Open Food Facts / Openverse / Amazon (product-level)
2. **One image fetch per variant group** (not per size)
3. Up to 3 retailers per group (`INDEX_IMAGE_MAX_RETAILERS_PER_GROUP`)
4. Skips re-fetch when `lastVerifiedAt` is fresh (`INDEX_IMAGE_STALE_DAYS=7`)

```bash
npm run db:push
npm run db:backfill-variant-groups   # migrate legacy rows once
npm run index:images                 # full index + group images

INDEX_IMAGE_MAX_GROUPS=3
INDEX_IMAGE_MAX_RETAILERS_PER_GROUP=3
INDEX_FETCH_RETAILER_IMAGES=off
```

## Catalog structure

Define groups in `catalog.ts`:

```ts
variantGroups: [
  createVariantGroup({
    parentId: "jeans-slim",
    color: "Black",
    sizes: [
      createVariantSize({ groupId: "jeans-slim--black", sizeLabel: "32x32" }),
      createVariantSize({ groupId: "jeans-slim--black", sizeLabel: "34x32" }),
    ],
  }),
]
```

Search: **“black jeans medium”** → Black group + size via waist mapping → **group image** on all cards.

## What we do not do

- Poll Walmart/Target/Nike on every user click
- Guarantee a photo from every retailer (bot blocks, search pages ≠ PDPs)
- Store image files in the database (only HTTPS URLs)

Legitimate upgrades later: retailer affiliate APIs during the **daily job only** — same tables, better `source` field.

## Commands

| Command | When |
|---------|------|
| `npm run index:daily` | Manual or cron — fills the database |
| `GET /api/cron/daily-index` | Hosted cron with `CRON_SECRET` |
| `GET /api/search/status` | Confirm own-DB mode is active |
