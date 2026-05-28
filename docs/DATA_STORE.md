# Shop Scout price database

Your own price DB is **`PriceQuote`** in SQLite (or PostgreSQL in production).

## One row = one store’s offer

| Column | Purpose |
|--------|---------|
| `productId` | Which catalog product |
| `retailerId` | e.g. `nike`, `amazon`, `walmart` |
| `priceUsd` / `landedCostUsd` | Numbers for sorting |
| `storeTitle` | Listing title on that store |
| `imageUrl` | **HTTPS URL only** (not image files in DB) |
| `productUrl` / `affiliateUrl` | Where to buy |
| `source` | `nightly_index`, `connector_api`, `cached_quote` |
| `expiresAt` | Auto-delete after this time |

## Why URLs, not photos on disk

Storing image **links** keeps the DB small (kilobytes per offer, not megabytes). The app loads images through `/api/image-proxy` when needed.

Product-level hero image stays on **`Product.imageUrl`**.

## How it fills up

1. **`npm run index:nightly`** — precomputes today’s grid per catalog item (random order each night).
2. **Amazon PA-API** — real Amazon price + image when credentials exist.
3. **User searches** — can append `cached_quote` rows.

## Daytime reads

`LIVE_PRICING_PROVIDER=cache` → searches read `PriceQuote` where `expiresAt > now`. No per-click retailer calls.

## What we do not build

Automated “invisible” scraping (fake mouse, rotating IPs to evade Nike/Walmart bot detection) is **not** part of Shop Scout. It breaks often, violates site rules, and can create legal risk beyond “I didn’t click Agree.”

Legitimate ways to add **real** non-Amazon prices: retailer affiliate APIs, data feeds, partnerships — same nightly pipeline, better `source` field.
