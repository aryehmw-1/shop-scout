# Commerce intelligence platform — architecture north star

Shop Scout is evolving from **product aggregation** into a **local-first commerce intelligence graph** with deterministic validation, explainable confidence, and evidence-grounded AI reasoning.

**We are not building:** another affiliate site, price scraper, or flat catalog DB.  
**We are building:** an AI purchasing analyst backed by structured evidence.

Related: [source evaluation](./COMMERCE_INTELLIGENCE_ARCHITECTURE.md) · [demo canonical build](./DEMO_COMMERCE.md)

---

## Strategic principles

| Principle | Implication |
|-----------|-------------|
| APIs & affiliate feeds first | Impact, Rakuten, CJ, Awin, Walmart API, eBay Browse, Amazon Creators |
| Scraping = fallback only | `http_lightweight` / `browser_rendered` last in acquisition order |
| Amazon = metadata anchor | Title, image, category, ASIN — **not** sole pricing authority |
| Feeds = offer graph | Many offers per canonical; consensus & anomaly detection |
| AI over evidence | LLMs consume retrieval payloads, not raw HTML |
| Multi-source agreement | Raises confidence; conflict lowers it |
| Deterministic core | Matching, scoring, ingestion auditable; LLMs augment reasoning |

---

## System layers

```text
┌──────────────────────────────────────────────────────────────────┐
│ UPSTREAM (ecosystems we leverage, not own)                        │
│ Amazon Creators · Impact/Rakuten/CJ/Awin feeds · Walmart · eBay   │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ INGESTION (event-driven, typed, reproducible)                   │
│ provenance · timestamps · source_reliability · audit log          │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ NORMALIZATION & IDENTITY                                          │
│ ASIN/GTIN/UPC · brand/model/title · clustering · variants         │
│ (extends src/lib/identity/confidence-engine.ts)                   │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ CANONICAL PRODUCT GRAPH                                           │
│ CanonicalProductNode · evidence[] · identity_confidence         │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ RETAILER OFFER GRAPH                                              │
│ RetailerOfferNode · validation · freshness · per-offer confidence │
│ (maps to Prisma PriceQuote long-term)                             │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ CONFIDENCE & VERIFICATION ENGINE (deterministic)                  │
│ GTIN · title · brand · attributes · consensus · anomaly · source  │
│ src/lib/commerce-intelligence/confidence/compute.ts               │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ AI COMMERCE INTELLIGENCE (retrieval-first)                        │
│ retrieve → rank → reason → generate                               │
│ CommerceRetrievalPayload (no raw pages)                           │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ UX: intelligence terminal · explainable compare · copilot         │
└──────────────────────────────────────────────────────────────────┘
```

**Code entry point:** `src/lib/commerce-intelligence/`

---

## 1. Canonical product intelligence graph

### Responsibilities

- Stable `canonical_id` (slug or hash cluster)
- Identifier anchoring: ASIN, GTIN, UPC, EAN, MPN
- Normalized brand / model / title (`identity/normalize-brand`, enrichment normalize)
- Duplicate clustering across retailers (future: feed-driven cluster job)
- Variant groups (`VariantGroup` in Prisma / catalog variants)
- Structured attributes (specs from Amazon + feed columns)

### Graph shape

One **canonical** node connects to:

- Many **offers** (retailer-specific)
- Many **evidence** records (audit trail)
- One **identity_confidence** snapshot (explainable)

TypeScript: `CanonicalProductNode`, `EvidenceRecord` in `commerce-intelligence/graph/types.ts`.

### Amazon’s role

| Use Amazon for | Do not use Amazon for |
|----------------|----------------------|
| canonical title & image | only price in compare |
| category & attributes | ignoring Walmart/Target feed prices |
| ASIN linkage | synthetic catalog volume |

---

## 2. Retailer offer graph

Offers are **first-class**, not embedded fields on a product row.

Each `RetailerOfferNode` includes:

- Price, shipping/landed cost, availability, seller
- Affiliate URL + provenance (`IngestionProvenance`)
- `validation_status`, `freshness_tier`, `expires_at`
- `OfferConfidenceSnapshot` (explainable reasons)

Enables:

- Consensus pricing (median, spread, outliers)
- Anomaly / fake discount detection (was_price vs feed)
- Historical tracking (Prisma `PriceHistory`, `PriceQuote.fetchedAt`)

**Production mapping:** `PriceQuote` + `RetailerProductIdentity` in `prisma/schema.prisma`.

---

## 3. Confidence & verification engine

### Signals (deterministic)

| Signal | Module |
|--------|--------|
| GTIN/UPC agreement | `identity/confidence-engine.ts` |
| Title similarity | `amazon-enrichment/similarity`, `catalog/title-similarity` |
| Brand normalization | `identity/normalize-brand.ts` |
| Attribute overlap | `identity/normalize-attributes.ts` |
| Multi-source consensus | `commerce-intelligence/confidence/compute.ts` |
| Source reliability | per `IngestionSourceType` priors |
| Price anomaly | spread ratio across validated offers |
| Link validity | `demo-commerce/canonical/offer-validation.ts` |

### Confidence targets

| Object | Fields |
|--------|--------|
| Product identity | `ProductIdentityConfidence` |
| Offer validity | `OfferConfidenceSnapshot` |
| Recommendation | derived from above + policy thresholds |

**Rule:** AI must not recommend offers below `policy.min_offer_confidence_to_recommend` without explicit uncertainty language.

### Human QA

`InventoryQaReview` on `PriceQuote` for scale with human-in-the-loop.

---

## 4. AI commerce intelligence layer

We use **external LLMs** (OpenAI, Anthropic, Gemini) — the moat is orchestration + graph + confidence.

### Pipeline separation

```text
1. RETRIEVE  → CommerceIntelligenceGraph + CommerceRetrievalPayload
2. RANK      → deterministic deal score + confidence (existing offer ranking)
3. REASON    → LLM with payload + policy constraints
4. GENERATE  → user-facing explanation with cited confidence
```

LLM input: `graphToRetrievalPayload()` — structured JSON, evidence summary, consensus block.

LLM must **not** receive: raw retailer HTML, unvalidated scrape text.

### Future recommendation modes

- Best value / safest purchase / fair price consensus
- Fake discount detection (`was_price` vs history)
- “Worth waiting?” (price history + volatility)
- Personalized (learning profile + confidence-weighted)

---

## 5. Ingestion phases

### Phase 1 (now)

| Source | Role |
|--------|------|
| Amazon Creators / PA-API | Canonical metadata |
| Impact feeds | Multi-retailer offers |
| Walmart Affiliate API | Walmart offers |
| eBay Browse | Marketplace offers + GTIN |

Commands: `npm run demo:build-canonical`

### Phase 2

Rakuten, CJ, Awin — same feed normalizer (Google Merchant schema).

### Avoid as core

Mass scrape, synthetic matrix, Honey/ShopSavvy, HTML-first pipelines.

---

## 6. Local-first & deterministic

| Practice | Implementation |
|----------|----------------|
| Local-first JSON | `data/canonical-products.json`, `amazon-enrichment-cache.json` |
| Reproducible builds | Seeded canonical list + cached enrichment |
| Typed schemas | `commerce-intelligence/graph/types.ts` |
| Audit trail | `EvidenceRecord` + `IngestionProvenance` |
| Observability | ingest reports, `/demo/status`, future event log |
| DB projection | Prisma sync when scaling past demo JSON |

Business logic stays in TypeScript scoring — LLMs only interpret scored evidence.

---

## 7. UX direction

**Feel like:** commerce intelligence terminal · AI shopping analyst · trusted advisor  

**Show:** confidence scores · why this offer · source type · freshness · price consensus  

**Avoid:** coupon-site patterns · opaque affiliate dumps · chatbot-with-links-only  

Next UI steps:

- Confidence badges on `CanonicalCompareView`
- “Why this recommendation” drawer from `confidence.reasons`
- `/api/intelligence/graph/[id]` for copilot tools

---

## 8. API

```http
GET /api/intelligence/graph/{canonical_id}
```

Returns full `CommerceIntelligenceGraph` + `CommerceRetrievalPayload` for grounded chat.

---

## 9. Migration path (existing code → platform)

| Today | Target |
|-------|--------|
| `demo-commerce/canonical/*` | Canonical graph (JSON → Prisma) |
| `identity/confidence-engine.ts` | Identity matching in ingest |
| `commerce-intelligence/confidence/compute.ts` | Unified graph confidence |
| `PriceQuote` | `RetailerOfferNode` persistence |
| `ChatApp` + search API | Retrieval payload → LLM |
| `retailer-metadata-registry.ts` | Source reliability priors |

---

## 10. Moat summary

We do **not** own all commerce data. We:

1. **Leverage** ecosystems (feeds, APIs)  
2. **Unify** into a canonical + offer graph  
3. **Validate** probabilistically with explainable confidence  
4. **Reason** with evidence-grounded AI  

That reasoning layer — not crawl breadth — is the long-term defensible product.
