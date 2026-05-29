# Inventory Strategy — Quality-First Commerce Intelligence

## Executive summary

**Confirm:** The right model is **curated canonical products + high-confidence matching + selective retailer enrichment** — not massive uncontrolled scraping.

**Current reality (measurable):**
- 67 curated canonical products (in-memory catalog → DB sync)
- 0 active verified offers (15 expired — recoverable via `npm run phase0:refresh`)
- 184 catalog_estimate rows (not production-usable)
- 24 observed retailer PDPs, 112 identifier graph edges
- 0 products with cross-retailer overlap **right now** (freshness blocker)

**Strategic bet:** Pasted-link workflows create **higher canonical identity resolution** than generic search because they start from a real PDP with extractable identifiers.

---

## 1. Current inventory architecture

### Layers

```
┌─────────────────────────────────────────────────────────────┐
│  CURATED CATALOG (CATALOG[] in memory)                        │
│  Canonical ID = catalogId (slug) · UPC/GTIN · category      │
└──────────────────────────┬──────────────────────────────────┘
                           │ ensureCatalogSynced()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  DB: Product · VariantGroup · ProductVariant · ProductAlias   │
│  ProductIdentifier (UPC/GTIN/ASIN edges)                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   Nightly index      Search enrich     Link ingest
   (5 core retailers) (user query)      (pasted PDP)
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│  PriceQuote rows                                            │
│  verified: scraped | connector_api | daily_index              │
│  estimated: catalog_estimate (UI hidden by default)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  RetailerProductIdentity — observed retailer PDP URLs         │
│  Linked to Product when match confidence passes               │
└─────────────────────────────────────────────────────────────┘
```

### How searches map to inventory

| Entry point | Resolution | Enrichment | Output |
|-------------|--------------|------------|--------|
| Text search | `product-resolver` scores CATALOG | `enrichOffersAtSearch` (core 5) | Verified + ranked offers |
| Compare mode | Exact catalog row | Same | Cross-retailer same-SKU |
| Pasted link | `ingestLinkProduct` → canonical lookup | PDP fetch + compare | Exact compare when confidence ≥ 0.75 |
| Nightly index | Iterates CATALOG | `indexCatalogItemNightly` | Persists validated PriceQuotes |

**We do NOT discover new products from retailer catalog crawls.** New canonical IDs enter via curated CATALOG edits or high-confidence link-ingest → human review queue (future).

---

## 2. Retailer ingestion behavior

| Retailer | Full catalog? | Mode | Nightly | Search | Link | Notes |
|----------|---------------|------|---------|--------|------|-------|
| Amazon | No | API + HTML adapter | ✓ | ✓ | ✓ | PA-API fallback; most stable |
| Walmart | No | PDP enrichment | ✓ | ✓ | ✓ | Proxy required at scale |
| Target | No | PDP enrichment | ✓ | ✓ | ✓ | Anti-bot; queue + proxy |
| Costco | No | PDP enrichment | ✓ | ✓ | ✓ | Hybrid API long-term |
| Kroger | No | PDP enrichment | ✓ | ✓ | ✓ | Regional proxy |
| Non-core (~150) | No | catalog_estimate only | rotation/off | multiplier | slug guess | Not verified when `INDEX_CORE_RETAILERS_ONLY=on` |

**Explicit answers:**
- **Entire catalogs?** No — never.
- **Search-driven subsets?** Yes — enrichment targets offers built from catalog item + retailer search/PDP URL.
- **PDP-only enrichment?** Yes — primary path for verified prices.
- **Cached historical offers?** Yes — `PriceQuote` with TTL; `ProductRetailerPriceStats` for trends.
- **User-triggered discovery?** Link paste resolves identity; does not auto-add catalog rows without review.

---

## 3. Product-count reality

Run `npm run inventory:report` or visit `/admin/inventory`.

| What users think | What it actually is |
|------------------|---------------------|
| "67 products" | 67 **curated canonical IDs** |
| "199 quotes" | 184 **estimates** + 15 **expired verified** |
| "Production inventory" | **0 active verified** until re-index |
| "Real compare grid" | Products with **2+ active verified retailers** = **0 today** |

**Target for Phase 0:** 15 production-usable products (A/B grade, 2+ retailers, fresh).

---

## 4. Recommended inventory strategy

### Confirmed model: Quality-first curated graph

1. **Curated canonical products** — human/semi-automated CATALOG curation; UPC-required for grocery.
2. **High-confidence matching** — identifier-first (UPC/GTIN/ASIN), variant-aware, explainable.
3. **Selective enrichment** — core 5 retailers only until reliability ≥ 80% fetch success.
4. **Category prioritization** — grocery/household before apparel.
5. **Link-driven acquisition** — pasted PDPs propose new canonical nodes (review before merge).
6. **No fake scale** — hide estimates; grade A/B only in consumer UI.

### Phases

| Phase | Goal | Inventory |
|-------|------|-----------|
| 0 (now) | Fresh verified recovery | 15 prod-usable |
| 1 | Flagship demo set | 30 canonical, 3+ retailers each |
| 2 | Grocery vertical | +50 UPC-backed pantry/dairy/household |
| 3 | Link graph growth | User links → canonical proposals |
| 4 | Scale infrastructure | Postgres, queue, Redis cache |

---

## 5. Category prioritization

### Expand first (matching reliability × scrape stability × variant simplicity)

| Tier | Categories | Why |
|------|------------|-----|
| **A** | pantry, dairy, household, beverages, snacks | UPC-heavy, simple variants, high retailer overlap |
| **B** | produce, meat, salad, cleaning | UPC ok; perishables add freshness pressure |
| **C** | sports, books, bedding | Moderate complexity |
| **Defer** | clothing, shoes | Size/color variant hell, lower scrape stability |
| **Avoid initially** | furniture, luxury | High variant noise, anti-bot, low overlap |

---

## 6. Canonical product graph

**Yes — this is the intended architecture**, partially built:

```
Product (catalogId)
  ├── ProductIdentifier (UPC, GTIN, ASIN, MPN)
  ├── VariantGroup (color/style)
  │     └── ProductVariant (size)
  ├── PriceQuote (retailer × channel × price)
  ├── RetailerProductIdentity (retailer PDP URL)
  └── ProductRetailerPriceStats (rolling intelligence)
```

**Gap today:** Many offers are estimates not linked through identifier resolution. Link ingest + nightly validated persist closes the loop.

**Evolution:**
- Every verified offer must link to `RetailerProductIdentity`
- Pasted links upsert identities with observed identifiers
- Reject offers that fail `identifiersExactMatch` or variant checks

---

## 7. Inventory health dashboard

**`/admin/inventory`** — canonical count, active/expired verified, overlap %, freshness, category coverage, grades, retailer ingestion model.

Commands:
```bash
npm run inventory:report -- --write
npm run audit:ops -- --write
npm run phase0:refresh -- --limit=15
```

---

## 8. Inventory scaling risks

| Risk | If we ingest aggressively |
|------|----------------------------|
| Anti-bot | IP bans; cascading fetch failures |
| Duplicate explosion | Same SKU, multiple catalogIds |
| Variant contamination | Wrong size/color in Best Deal |
| Storage growth | PriceQuote rows × retailers × products unbounded |
| Matching degradation | Title-fuzzy drift; confidence collapse |
| Fake scale | 10k catalog rows, 0 verified — useless |
| Runtime | Sequential scrape doesn't scale past ~200 products |

**Guardrails:** CORE_RETAILERS_ONLY, validated-only persist, A/B grade gate, variant Best Deal suppression, weekly audit.

---

## 9. Pasted-link driven inventory

**Evaluate: YES — primary acquisition flow for Phase 1–2.**

| Factor | Generic search | Pasted link |
|--------|----------------|-------------|
| User intent | Medium | **Very high** |
| Identity signal | Title tokens | **PDP + UPC/ASIN** |
| Reference price | Estimate | **Scraped from source** |
| Canonical resolution | Fuzzy | **Identifier-first** |
| Conversion potential | Lower | **Higher** |

**Recommendation:** Lead demo UX with `/chat?hint=link`. Use link ingest to **propose** canonical graph nodes; auto-merge only at exact UPC/GTIN match.

---

## 10. Long-term retailer reliability (production-grade)

Not brittle hacks — sustainable architecture:

### Infrastructure

| Component | Purpose |
|-----------|---------|
| **Residential proxy pool** | Per-retailer rotation; sticky sessions for Walmart/Target/Kroger |
| **Job queue (BullMQ/SQS)** | Rate limits per retailer; retry with backoff |
| **Redis quote cache** | Hot compare grids; 60min verified TTL |
| **PostgreSQL** | Replace SQLite for concurrent index + search |
| **Retailer adapter layer** | Already exists — extend, don't fork |

### Per-retailer strategy

| Retailer | Approach |
|----------|----------|
| **Amazon** | PA-API primary; HTML adapter fallback; ASIN as primary key |
| **Walmart** | Residential proxy + JSON-LD + adapter; item ID from URL |
| **Target** | Proxy + structured data; TCIN registry; lower concurrency |
| **Costco** | Membership-aware API/partner feed exploration; limited scrape |
| **Kroger** | Regional proxy pools; zip-aware enrichment |

### Confidence scoring

- `RetailerQualityMetric` — fetch/parser/accept rates (populate via index)
- Per-offer `matchConfidence` from `confidence-engine`
- Retailer trust in deal ranking (`retailer-quality-store`)
- **Do not show Best Deal** below confidence threshold

### Fallback chain

```
1. Cached verified quote (if fresh)
2. Live PDP fetch (adapter)
3. API (Amazon PA-API)
4. Stale quote with "price may have changed" (future)
5. Omit — never show estimate as verified
```

---

## Immediate actions

```bash
unset INDEX_PROXY_LIST          # until real proxy credentials configured
npm run phase0:refresh -- --limit=15
npm run inventory:report -- --write
open /admin/inventory
```

**Goal:** High-confidence commerce intelligence graph — not a giant noisy product dump.
