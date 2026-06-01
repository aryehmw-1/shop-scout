# Inventory Health Report

Generated: 2026-05-29T17:15:37.208Z

## Product-count reality

| Metric | Count |
|--------|------:|
| Curated canonical catalog (in-memory) | 67 |
| Canonical products in DB | 67 |
| Production-usable products | 0 (0.0%) |
| Total PriceQuote rows | 0 |
| Verified quote rows (all time) | 0 |
| **Active verified quotes** | **0** |
| Expired verified (needs re-index) | 0 |
| Catalog estimate rows | 0 |
| Unique retailer PDPs (RetailerProductIdentity) | 50 |
| PDPs linked to canonical product | 50 |
| Product identifier graph edges | 120 |
| Products with 2+ retailer overlap (active) | 0 |
| Products with 3+ retailer overlap | 0 |

> **Real inventory size for demos:** active verified products with cross-retailer overlap — not raw catalog count.

## Category coverage

| Category | Canonical | Active | Expired | 2+ retailers | Prod-usable |
|----------|----------:|-------:|--------:|-------------:|------------:|
| clothing | 22 | 0 | 0 | 0 | 0 |
| shoes | 14 | 0 | 0 | 0 | 0 |
| pantry | 7 | 0 | 0 | 0 | 0 |
| salad | 5 | 0 | 0 | 0 | 0 |
| dairy | 5 | 0 | 0 | 0 | 0 |
| bedding | 4 | 0 | 0 | 0 | 0 |
| produce | 2 | 0 | 0 | 0 | 0 |
| meat | 2 | 0 | 0 | 0 | 0 |
| sports | 2 | 0 | 0 | 0 | 0 |
| books | 2 | 0 | 0 | 0 | 0 |
| bakery | 1 | 0 | 0 | 0 | 0 |
| household | 1 | 0 | 0 | 0 | 0 |

See docs/INVENTORY_STRATEGY.md for architecture and scaling plan.