# URL / Product-Link Ingestion Audit

## Pipeline (pasted link → verified equivalents)

1. **URL normalization** — `extractUrl()` strips trailing punctuation; `parseProductUrl()` decodes hostname, path slugs, query params.
2. **Retailer detection** — `URL_HOST_RETAILER` + subdomain match → `sourceRetailer`; unknown hosts flagged `unsupportedRetailer`.
3. **Search URL rejection** — `isSearchProductUrl()` blocks non-PDP links early in ingest.
4. **External ID extraction** — `extractExternalIdsFromUrl()`: Amazon ASIN, Walmart item id, Target TCIN, Costco item id.
5. **PDP fetch (core retailers)** — `fetchRetailerPageData()` for amazon/walmart/target/costco/kroger: live title, price, image, JSON-LD identifiers.
6. **Variant parsing** — `parseVariantFromTitle()`: color, size, pack count, volume, storage GB.
7. **Canonical resolution** — `resolveLinkCanonicalProduct()`:
   - ProductIdentifier DB lookup (UPC/GTIN/ASIN/MPN)
   - Catalog UPC match
   - High-confidence title match (`findCatalogMatchByTitle` + similarity threshold)
8. **Match tier** — `exact` | `near` | `family` | `none` with confidence score + equivalence reasons.
9. **Search mode selection**:
   - **Exact compare** (`compareProduct`) when tier exact/near ≥0.75 and no variant conflict
   - **Similar fallback** (`searchSimilarFromLink`) otherwise
10. **Retailer expansion** — `enrichOffersAtSearch()` scrapes core retailers for verified PDP prices.
11. **Variant gating** — variant conflicts suppress Best Deal ranking.
12. **Deal ranking** — `finalizeResultsForUser()` applies market comparison + explainability.

## Retailer support matrix (pasted links)

| Retailer | PDP fetch | ID extract | Exact matching | Notes |
|----------|-----------|------------|----------------|-------|
| Amazon | ✅ (HTML + PA-API fallback) | ASIN from URL | Strong | Best demo retailer |
| Walmart | ⚠️ (proxy-dependent) | Item id from URL | Good when unblocked | Needs residential proxy |
| Target | ⚠️ (often blocked) | TCIN partial | Moderate | Anti-bot heavy |
| Costco | ⚠️ | Item id partial | Moderate | Often needs API/hybrid |
| Kroger | ⚠️ | Limited | Weak | Proxy required |
| Other hosts | ❌ slug-only | None | Title guess only | Unsupported for exact compare |

## Equivalence explainability

Users see `EquivalenceExplainer` bullets such as:

- Matched via UPC / GTIN / ASIN
- Matched via normalized title (high similarity)
- Variant attributes align with catalog row
- Low-confidence variant: size/color/pack mismatch

## Analytics events

- `link_pasted`, `link_ingest_success`, `link_ingest_failed`
- `link_canonical_exact`, `link_canonical_near`, `link_canonical_failed`
- `link_low_confidence`, `link_unsupported_retailer`

## Commands

```bash
npm run audit:links          # sample URL matching audit
npm run phase0:refresh       # re-index expired verified products
POST /api/search/from-link   # dedicated link search API
```

## Phase 0 operational recovery

1. `npm run phase0:refresh -- --limit=15` — refresh expired verified quotes
2. Ensure Amazon PA-API configured; unset invalid `INDEX_PROXY_LIST` until real proxy
3. Curate flagship demo links (Amazon grocery/apparel with UPC catalog matches)
4. Re-run `npm run audit:ops -- --write` until production-usable count > 0
