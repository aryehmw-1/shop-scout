# Retailer intelligence framework

Adaptive retailer routing — not one scraper per store forever.

## Layers

```
URL / search intent
       ↓
RetailerIntelligenceProfile (registry)
       ↓
FetchTransport + ProxyProvider
       ↓
ExtractionStrategy chain (json_ld → next_data → adapter → static_html)
       ↓
Normalization + confidence scoring → PriceQuote
```

## Key modules

| Module | Path |
|--------|------|
| Capability registry | `src/lib/retailers/intelligence/registry.ts` |
| Types | `src/lib/retailers/intelligence/types.ts` |
| Proxy abstraction | `src/lib/retailers/transport/proxy-provider.ts` |
| Direct + rotating impl | `src/lib/retailers/transport/direct-proxy-provider.ts` |
| Legacy adapters | `src/lib/offers/retailer-adapters/*` |

## Extraction strategies

| Strategy | When |
|----------|------|
| `adapter_custom` | Registered parser (Walmart `__NEXT_DATA__`, Target TCIN, etc.) |
| `next_data` | React/Next.js embedded JSON |
| `json_ld` | Schema.org Product/Offer |
| `react_hydration` | Alternate hydration blobs (`__TGT_DATA__`) |
| `static_html` | Meta tags + regex fallback |
| `shopify_json` | `/products/{handle}.json` |
| `api_fallback` | Amazon PA-API |

## Proxy modes (interface only today)

- `direct` — implemented
- `residential` — via `INDEX_PROXY_LIST` when configured
- `rotating` — multi-endpoint pool
- `browser_session` — reserved for Playwright/Puppeteer flows

## Walmart + Target (Phase 1)

Both registered with `proxyRequired: true`, `extractionStrategies: [adapter_custom, next_data, json_ld]`.

Without `INDEX_PROXY_LIST`, fetches will still fail at bot walls — adapters are ready; transport needs residential proxy in production.

## Catalog expansion

Flagship set expanded to **33 grocery/household SKUs** in `flagship-catalog.ts`. Full curated catalog: **80 products** in `catalog.ts`.

Run nightly index:

```bash
INDEX_FLAGSHIP_ONLY=on npm run index:nightly
```
