# Shop Scout Data Source Audit

Last updated: June 2026

## Current Sources

### Persisted inventory database

Prisma is already the strongest source-of-truth layer. The schema includes products, identifiers, aliases, variants, live/cached quotes, price history, retailer quality metrics, search sessions, learning events, and saved offers.

Key files:

- `prisma/schema.prisma`
- `src/lib/db/catalog-sync.ts`
- `src/lib/db/search-repository.ts`
- `src/lib/inventory/verified-inventory-resolver.ts`
- `src/lib/pricing/*`

Status: keep this as the long-term center of Shop Scout.

### Live product providers

Live provider data is currently bootstrapped through the provider abstraction.

Key files:

- `src/lib/product-data/types.ts`
- `src/lib/product-data/ebay.ts`
- `src/lib/product-data/shopsavvy.ts`
- `src/lib/product-data/index.ts`
- `src/app/api/test/ebay/route.ts`
- `src/app/admin/ebay/page.tsx`

Status: eBay is active now. ShopSavvy is a bootstrap source when configured. Frontend code should never call either provider directly.

### Demo and catalog fallback data

Demo/canonical data still exists and is useful for design, local testing, and empty states, but it should not be treated as the product truth in production search.

Key files:

- `src/lib/retailers/catalog.ts`
- `src/lib/demo-commerce/*`
- `data/canonical-products.json`

Status: fallback only. Production should prefer persisted inventory and live provider results.

### AI

AI is used for conversation, extraction, normalization help, and recommendations. AI should explain and rank structured data, not invent prices.

Key files:

- `src/lib/ai/index.ts`
- `src/lib/ai/gemini.ts`
- `src/lib/ai/anthropic.ts`
- `src/lib/ai/generate-reply.ts`

Status: server-side only. Gemini is primary and Claude is fallback.

## What Is Already Covered

- Product identity: `Product`, `ProductIdentifier`, `ProductAlias`, `RetailerProductIdentity`
- Variant handling: `VariantGroup`, `ProductVariant`
- Price source and history: `PriceQuote`, `PriceHistory`, `PriceHistorySnapshot`
- Quality/audit trail: `InventoryQaReview`, `RetailerQualityMetric`, `LearningEvent`
- User flows: `SearchSession`, `SearchQuery`, `SavedOffer`
- Live providers: normalized eBay and ShopSavvy provider layer
- Central outbound/affiliate path: `/api/outbound` and `src/lib/affiliate.ts`

## Gaps To Close Next

- Add explicit `Retailer` and `Category` tables if the admin/debug tools need managed retailer/category metadata instead of string fields.
- Consolidate inventory reads behind one `inventory-service` facade so pages do not decide between database, provider, and demo paths independently.
- Add a seed/import job for the first 50k common products and common identifiers.
- Add provider result persistence so good eBay/ShopSavvy matches can become database-backed products and price quotes.
- Add automated verification scripts that prove a product can be found from the database path without demo fallback.

## Recommended Operating Rule

For production search:

1. Search persisted inventory first.
2. Add fresh provider offers when configured.
3. Persist high-quality provider matches back into `Product` and `PriceQuote`.
4. Use demo data only when explicitly enabled for local testing.
5. Let AI summarize the structured result; never let AI create retailer prices.

