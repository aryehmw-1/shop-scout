# Commerce intelligence source evaluation & architecture

> **Platform north star:** [COMMERCE_INTELLIGENCE_PLATFORM.md](./COMMERCE_INTELLIGENCE_PLATFORM.md) — graph model, confidence engine, AI retrieval layer.

**Strategy:** Bootstrap a trusted comparison platform using **official APIs, affiliate networks, and feeds**—not retailer-by-retailer scraping. Your moat is normalization, AI reasoning, and UX—not crawl coverage.

**Shop Scout today:** Canonical product model (`data/canonical-products.json`), Amazon enrichment cache, Impact verification, outbound affiliate tags, acquisition priority `official_api → affiliate_feed → scrape`.

Machine-readable matrix: [`COMMERCE_SOURCE_MATRIX.json`](./COMMERCE_SOURCE_MATRIX.json)

---

## 1. Compatibility matrix (summary)

Scores use **1–10** (higher = better for quality/priority; **difficulty** = higher is harder).

| Company | Tier | Type | Difficulty | Data | Images | Affiliate | Canonical | Anti-bot | Priority | Role |
|---------|------|------|------------|------|--------|-----------|-----------|----------|----------|------|
| Amazon Creators/PA-API | 1 | API | 4 | 9 | 9 | ✓ | ✓ | 1 | 10 | **Primary truth** |
| Impact.com | 1 | Network feed/API | 5 | 8 | 8 | ✓ | ✓ | 1 | 9 | **Primary truth** |
| Walmart Affiliate API | 1 | API | 5 | 8 | 8 | ✓ | ✓ | 1 | 9 | **Retailer offers** |
| Rakuten Advertising | 1 | SFTP/API | 6 | 7 | 7 | ✓ | ✓ | 1 | 8 | **Primary truth** |
| CJ Affiliate | 1 | Feed | 6 | 7 | 7 | ✓ | ✓ | 1 | 8 | **Primary truth** |
| Awin | 1 | Feed/API | 6 | 7 | 7 | ✓ | ✓ | 1 | 7 | **Primary truth** |
| eBay Browse API | 1 | API | 5 | 8 | 8 | ✓ | ✓ | 1 | 7 | Enrichment + offers |
| Target / Best Buy / Costco | 2 | Affiliate feeds | 6–7 | 6–7 | 6–7 | ✓ | △ | 4–7 | 5–7 | **Retailer offers** |
| Skimlinks / Sovrn | 2 | Link API | 4 | 5 | 4 | ✓ | ✗ | 1 | 6 | **Attribution** |
| Etsy Open API | 2 | API | 5 | 7 | 8 | ✓ | ✓ | 1 | 5 | Niche vertical |
| Google Merchant API | 2 | API | 7 | 8 | 8 | ✗ | ✓ | 1 | 5 | Own-SKU only |
| Shopify / WooCommerce | 2–3 | Per-store | 7–8 | 7–8 | 7–8 | △ | ✓ | 1–2 | 3–4 | Partner merchants |
| Google Shopping CSS | 3 | Partner | 9 | 9 | 9 | ✗ | ✗ | 2 | 3 | Not for bootstrap |
| Honey / Capital One / ShopSavvy | 3 | Closed | 10 | 2 | 2 | ✗ | ✗ | 9 | 1 | **Avoid** |
| CamelCamelCamel / PriceGrabber | 3 | Scrape/legacy | 7–8 | 4–6 | 3–4 | ✗ | ✗ | 6–8 | 1–2 | **Avoid** |
| Direct HTML scrape | 3 | Scrape | 9 | 5 | 5 | △ | ✗ | 9 | 2 | **Last resort** |

△ = partial (offers/links, not stable global canonical identity)

---

## 2. Tier classification

### Tier 1 — Foundational (build production integrations)

| Source | Why |
|--------|-----|
| **Amazon Creators API** (migrate from PA-API before May 2026) | Canonical title, image, category, PDP, price; already in codebase |
| **Impact.com** | Multi-brand product catalogs, tracking links, Walmart/Target feeds; verification in repo |
| **Walmart Affiliate Marketing API** | Official search/item/taxonomy for Walmart offers |
| **Rakuten + CJ + Awin** | Bulk merchant feeds (Google Merchant–style), deep links, scalable offer ingest |
| **eBay Browse API** | Strong marketplace search, GTIN/keyword, affiliate URLs |

### Tier 2 — Supplemental

- **Target / Best Buy / Costco** — offers via network feeds + validated search URLs; not scrape-first  
- **Skimlinks / Sovrn** — monetize outbound when network doesn’t cover a retailer  
- **Etsy** — vertical expansion  
- **TikTok Shop / Pinterest** — distribution or future verticals, not core compare graph  

### Tier 3 — High friction / low value

- Consumer apps (Honey, Capital One Shopping, ShopSavvy)  
- Scraping comparison sites (CamelCamelCamel, PriceGrabber)  
- **Mass retailer HTML scraping** as primary architecture  
- Google Shopping as a **crawl target** (no open comparison API)  

---

## 3. Recommended architecture

Aligns with your target stack and existing Shop Scout modules:

```text
┌─────────────────────────────────────────────────────────────┐
│ UPSTREAM SOURCES (Tier 1 first)                              │
├─────────────────────────────────────────────────────────────┤
│ Amazon Creators API     → canonical metadata (title/image/ASIN)│
│ Impact / Rakuten / CJ / Awin → merchant product feeds         │
│ Walmart Affiliate API   → Walmart offers (search/item)       │
│ eBay Browse API         → marketplace offers + GTIN match      │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ INGESTION & NORMALIZATION (build in 2–4 weeks)                 │
│ • Feed parser (Google Merchant XML/CSV)                      │
│ • ASIN / GTIN / UPC / brand+title clustering                 │
│ • Amazon enrichment cache (existing)                         │
│ • Retailer offer builder (existing canonical model)            │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ CANONICAL PRODUCTS (existing)                                │
│ canonical_id, title, image, category, keywords               │
│ offers[]: retailer, price, url, confidence                     │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ QUALITY VALIDATION (existing)                                │
│ semantic match, category allowlists, reject placeholders     │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ AI SHOPPING INTELLIGENCE (your moat)                         │
│ chat, compare, recommendations, reasoning on canonical graph │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ CONVERSATIONAL UX (existing CompareExperience, ChatApp)     │
└─────────────────────────────────────────────────────────────┘
```

**Acquisition priority** (already codified in `retailer-metadata-registry.ts`):

`official_api` → `affiliate_feed` → `merchant_feed` → `cached_structured` → `http_lightweight` → `browser_rendered`

---

## 4. Best immediate integrations (next 30 days)

| Order | Integration | Effort | Impact |
|-------|-------------|--------|--------|
| 1 | **Amazon Creators API** migration | Medium | Unblocks canonical metadata long-term |
| 2 | **`npm run demo:build-canonical`** + commit JSON | Low | 50 trusted products live |
| 3 | **Impact catalog API** (partner account) | Medium | Walmart/Target/Best Buy feeds in one pipe |
| 4 | **Walmart Affiliate API** | Low–medium | Real Walmart prices/URLs |
| 5 | **Unified feed normalizer** (Google Merchant schema) | Medium | Scales all network feeds |
| 6 | **eBay Browse** for electronics seeds | Low | Extra offers + GTIN linking |

**Stop investing in:** catalog-matrix cross-joins, Unsplash images, bulk HTML adapter scrape as primary path.

---

## 5. Fastest path to **50 trusted canonical products**

| Step | Action | Time |
|------|--------|------|
| 1 | Configure Amazon Associates + PA-API/Creators credentials | 1 day |
| 2 | Run `npm run demo:build-canonical` (50 seeds in `canonical/seeds.ts`) | ~1 hour throttled |
| 3 | Commit `data/canonical-products.json` + `amazon-enrichment-cache.json` | — |
| 4 | Add **Walmart API** for Walmart rows (replace search-only where possible) | 2–3 days |
| 5 | Manual QA 10 hero products (electronics + grocery) | 1 day |

**Expected yield:** 35–50 published (≥2 offers each) depending on PA-API match rate.

---

## 6. Fastest path to **500+ products**

| Phase | Source | Volume |
|-------|--------|--------|
| A | Impact/Rakuten product catalogs (joined advertisers) | 200–2k SKUs/merchant |
| B | Cluster feeds → canonical via ASIN/GTIN/title rules | 500+ canonical |
| C | Amazon enrichment for orphans (title/image) | Quality pass |
| D | Human rules: min 2 retailers, confidence ≥ 0.62 | Publish gate |

**Do not** reach 500 by lowering quality or synthetic cross-join.

Rough timeline: **4–8 weeks** with one engineer + affiliate approvals (network onboarding is often the bottleneck, not code).

---

## 7. Long-term scalable architecture

| Layer | Responsibility |
|-------|----------------|
| **Feed orchestrator** | Nightly pull Impact/Rakuten/CJ/Awin + incremental deltas |
| **Identity resolver** | UPC/GTIN/ASIN/brand+MPN → `canonical_id` |
| **Offer service** | Per-retailer price, URL, freshness, affiliate redirect |
| **Enrichment service** | Amazon (or brand PDP) for image/title when feed thin |
| **Quality service** | Existing `quality.ts` + offer validation |
| **Graph store** | Postgres `Product` / `PriceQuote` (already in Prisma) + JSON for demo |
| **AI layer** | RAG over canonical graph + live quote refresh on intent |
| **Attribution** | Impact + per-retailer tags + Skimlinks fallback |

Migrate demo JSON → Prisma sync (`catalog-sync`) for production scale.

---

## 8. Source roles: primary / enrichment / fallback

| Role | Sources |
|------|---------|
| **Primary truth (canonical identity)** | Amazon Creators API, feed clusters with strong GTIN/ASIN, Impact catalog IDs |
| **Primary truth (retailer offers)** | Impact/Rakuten/CJ/Awin feeds, Walmart Affiliate API, eBay Browse API |
| **Enrichment only** | Amazon search for title/image when feed row is thin; Etsy/TikTok for verticals |
| **Attribution only** | Skimlinks, Sovrn, generic affiliate tags |
| **Fallback only** | Validated retailer search URLs, cached quotes, light HTTP (existing adapters) |
| **Not recommended** | Mass scrape, Honey/Capital One, CamelCamelCamel, synthetic matrix |

---

## 9. Production integration worth building

| Integration | Build? | Notes |
|-------------|--------|-------|
| Amazon Creators API | **Yes** | Required before PA-API sunset |
| Impact catalog ingest | **Yes** | Highest leverage multi-retailer |
| Walmart Affiliate API | **Yes** | Core US retailer |
| Feed normalizer (Google Merchant) | **Yes** | One parser for all networks |
| Rakuten / CJ / Awin | **Yes** (phased) | Redundancy + coverage |
| eBay Browse | **Yes** | Marketplace + GTIN |
| Target official API | No public API — **feed only** |
| Best Buy open API | **Feed only** |
| Google Shopping crawl | **No** |
| Retailer HTML scrape at scale | **No** (escalation only) |
| Klarna / Honey / ShopSavvy | **No** |

---

## 10. Per-platform quick reference

### Commerce / shopping

- **Google Shopping** — No open comparison ingest API; Merchant API is for *your* SKUs. CSS program is a long-term play, not bootstrap.  
- **Amazon** — **Best canonical source**; migrate to Creators API; 10 sales/30d eligibility.  
- **Walmart** — **Affiliate Marketing API** on walmart.io (Impact publisher ID).  
- **Target** — Affiliate feeds (Impact/Rakuten); scrape is fragile.  
- **Best Buy** — Affiliate feeds via networks; no stable public product API.  
- **Costco** — Affiliate + search links; limited feeds.  

### Affiliate networks (highest leverage for offers)

- **Impact** — Catalog API/FTP, marketplace, Google-format; **already partially integrated**.  
- **Rakuten** — SFTP catalogs + `productsearch` API; per-advertiser approval.  
- **CJ / Awin / ShareASale** — Standard product feeds; normalize once.  
- **Skimlinks / Sovrn** — Link monetization, not catalog depth.  

### Comparison / consumer apps

- **Klarna, Honey, Capital One Shopping, ShopSavvy** — Not B2B catalog partners for your use case.  
- **ShopStyle** — Fashion feeds via Rakuten.  
- **CamelCamelCamel** — Amazon history; use Amazon API instead.  
- **PriceGrabber / Shopping.com** — Legacy; skip.  

### Marketplaces & platforms

- **eBay** — **Strong** Browse API + affiliate.  
- **Etsy** — Good API; niche.  
- **Shopify / WooCommerce** — Per-merchant only.  
- **Pinterest / TikTok Shop** — Outbound/distribution, not core ingest.  

### Tools

- **DataFeedWatch** — Feed tooling for merchants, not your upstream.  

---

## 11. Compliance & rate limits (pragmatic)

| Source | Rate limits | ToS |
|--------|-------------|-----|
| Amazon | Throttle (~1 req/s); eligibility rules | Associates Operating Agreement; API only |
| Impact/Rakuten | Per-account API/FTP policies | Network terms; catalog use restricted to approved partners |
| Walmart Affiliate | Documented API limits | Affiliate agreement |
| eBay | Browse API quotas by tier | ePN affiliate required for commission URLs |
| Scraping retailers | N/A | Often prohibits automated access; **deprioritize** |

---

## 12. Mapping to Shop Scout capabilities

| Capability | Best sources |
|------------|----------------|
| Canonical products | Amazon API + feed clustering (ASIN/GTIN) |
| Retailer offers | Impact/Rakuten feeds, Walmart API, eBay API |
| Image enrichment | Amazon primary; feed `image_link` secondary |
| Category normalization | Amazon classifications + taxonomy allowlists (`taxonomy.ts`) |
| AI recommendation grounding | Canonical graph + Prisma `PriceQuote` + fresh API refresh on intent |
| Affiliate attribution | Impact + retailer tags + `/api/outbound` |

---

## Related docs

- [`DEMO_COMMERCE.md`](./DEMO_COMMERCE.md) — canonical build commands  
- [`COMMERCE_SOURCE_MATRIX.json`](./COMMERCE_SOURCE_MATRIX.json) — full matrix for tooling  
- `src/lib/retailers/acquisition/retailer-metadata-registry.ts` — per-retailer compliance  
