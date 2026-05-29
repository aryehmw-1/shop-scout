# Inventory Health Report

Generated: 2026-05-29 (manual sync from DB)

## Product-count reality

| Metric | Count |
|--------|------:|
| Curated canonical catalog (in-memory) | 67 |
| Canonical products in DB | 67 |
| Production-usable products | **0** (0.0%) |
| Total PriceQuote rows | 199 |
| Verified quote rows (all time) | 15 |
| **Active verified quotes** | **0** |
| Expired verified (needs re-index) | 15 |
| Catalog estimate rows | 184 |
| Unique retailer PDPs (RetailerProductIdentity) | 24 |
| PDPs linked to canonical product | 24 |
| Product identifier graph edges | 112 |
| Products with 2+ retailer overlap (active) | 0 |
| Products with 2+ retailer overlap (historical, expired) | 3 |

> **Real inventory size for demos:** active verified products with cross-retailer overlap — not raw catalog count.

## Verified offers by retailer (all time)

| Retailer | Total verified | Active |
|----------|---------------:|-------:|
| walmart | 7 | 0 |
| carters | 6 | 0 |
| amazon | 2 | 0 |

## Category coverage

| Category | Canonical | Notes |
|----------|----------:|-------|
| clothing | 22 | Defer — variant complexity |
| shoes | 14 | Defer — variant complexity |
| pantry | 7 | **Expand first** (UPC-heavy) |
| salad | 5 | Tier B |
| dairy | 5 | **Expand first** |
| bedding | 4 | Tier C |
| produce | 2 | Tier B |
| meat | 2 | Tier B |
| sports | 2 | Tier C |
| books | 2 | Tier C |
| bakery | 1 | Tier B |
| household | 1 | **Expand first** |

## Immediate recovery

```bash
npm run phase0:refresh -- --limit=15
npm run inventory:report -- --write
open /admin/inventory
```

See `docs/INVENTORY_STRATEGY.md` for architecture and scaling plan.
