# Retailer adapters

Shop Scout enriches nightly index offers by fetching retailer search/PDP pages. **Dedicated adapters** parse each chain’s embedded JSON/HTML; everything else uses a **generic** JSON-LD + meta tag parser (often `price: undefined` on search URLs).

## Configured adapters

| Retailer | File | Notes |
|----------|------|--------|
| Walmart | `walmart.ts` | `__NEXT_DATA__` itemStacks |
| Target | `target.ts` | `__NEXT_DATA__` + `tcin` |
| Amazon | `amazon.ts` + `amazon-resolve.ts` | `data-asin` + PA-API fallback |
| Aldi | `aldi.ts` | Product JSON / slug |
| Kroger | `kroger.ts` | UPC + `/p/` PDP |
| Costco | `costco.ts` | `.product.{id}.html` |

## Amazon resilience

| Env | Default | Purpose |
|-----|---------|---------|
| `INDEX_USER_AGENT_POOL` | 4 browser UAs | Rotate per request (`\|` or `,` separated) |
| `INDEX_PROXY_URL` | — | Single residential proxy |
| `INDEX_PROXY_LIST` | — | Rotate proxies (`http://user:pass@host:port`, …) |
| `INDEX_FETCH_ATTEMPTS` | `3` for Amazon, `2` others | Retry with new UA/proxy |
| `INDEX_AMAZON_PAAPI_FALLBACK` | `on` | Use PA-API when HTML blocked/empty |
| `INDEX_FETCH_TIMEOUT_COSTCO_MS` | `20000` | Per-retailer timeout override |

Requires PA-API keys for fallback: `AMAZON_PA_API_ACCESS_KEY`, `AMAZON_PA_API_SECRET_KEY`, `AMAZON_PA_API_PARTNER_TAG`.

## Run audit

```bash
npm run audit:adapters
```

## Purge bad scraped prices

```bash
npm run db:purge-absurd-scraped -- --dry-run
npm run db:purge-absurd-scraped
npm run db:purge-estimates
```

## Walmart proxy (local)

Walmart often blocks datacenter IPs in under 500ms. Set a residential proxy:

```bash
export INDEX_PROXY_LIST="http://USER:PASS@proxy.example:PORT"
export INDEX_PROXY_RETAILERS=walmart,amazon
```

See `.env.index.example` for all index env vars.

## Grocery adapters always on

`aldi`, `kroger`, and `costco` are **never skipped** even if `INDEX_SCRAPE_SKIP_RETAILERS` includes them. Default skip is only `hm`.

## Add a new adapter

1. Create `src/lib/offers/retailer-adapters/{retailer}.ts` implementing `RetailerPageAdapter`.
2. Register in `retailer-adapters/index.ts` → `ADAPTERS`.
3. Add fixture HTML to `smoke-test.ts`.
4. Run `npm run test:adapters` and a live `npm run index:full:local -- --limit=3`.

## Generic parser limitations

Retailers without adapters still fetch search URLs but usually return:

- No price (search pages lack JSON-LD Product)
- Occasional images from Open Graph
- `catalog_estimate` prices in DB until scraped

Priority queue for new adapters: **HEB, Publix, Safeway, Albertsons, Sam’s, Whole Foods, Hy-Vee** (grocery), then **Macys, Gap, Nike** (apparel).
