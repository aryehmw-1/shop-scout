# Shop Scout — Backend Architecture

## Search pipeline

```
POST /api/chat  or  POST /api/search
        ↓
  SearchService (src/lib/search/search-service.ts)
        ↓
  ┌─ TTL cache (15 min)
  ├─ ProductResolver — multi-signal catalog match
  ├─ CatalogConnector — retailer multiplier pricing
  ├─ Amazon PA-API — live Amazon price + image (when configured)
  ├─ DB cache — recent PriceQuote rows (optional)
  └─ SQLite persist — SearchSession, SearchQuery, PriceQuote
```

## Live pricing

```bash
LIVE_PRICING_PROVIDER=cache   # or off
AMAZON_PA_API_ACCESS_KEY=...
AMAZON_PA_API_SECRET_KEY=...
AMAZON_PA_API_PARTNER_TAG=yourtag-20
```

Flow:

1. `catalogConnector` builds retailer rows.
2. `fetchLiveQuotes` adds **Amazon PA-API** (if configured) and **DB cache** (if mode is `cache`).
3. `mergeLivePrices` overlays verified prices on matching rows.

See [FREE_PRICING.md](./FREE_PRICING.md) and [AMAZON_PAAPI.md](./AMAZON_PAAPI.md).

Check status: `GET /api/search/status`

## Browser extension

`extension/` → calls `POST /api/extension/compare` while browsing a product page.

## Database

See Prisma schema in `prisma/schema.prisma`. Run `npm run db:push` and `npm run db:seed`.
