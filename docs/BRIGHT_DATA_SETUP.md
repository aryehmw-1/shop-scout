# Bright Data setup

Homivion uses Bright Data to ingest raw product results from the top retailers,
which then flow through the verification pipeline
(`RAW → CHECKED → MATCHED → VERIFIED → PUBLISHED`). **Nothing ingested is shown to
users until it reaches `PUBLISHED`.**

The API key is read from the `BRIGHT_DATA_API_KEY` environment variable. It is
**never hardcoded** anywhere in source — only read from env at runtime
(`src/lib/pipeline/bright-data-client.ts`).

## Where to put the API key

You must place the **same** key in every environment that runs the ingestion or
the connection test.

### 1. Local development — `.env.local`

`.env.local` is gitignored (never committed). Add:

```
BRIGHT_DATA_API_KEY=0afb0c9f-5a9c-4fdc-bed9-ccd61835f4ac
```

(A placeholder line is already present — replace the value if your key rotates.)

### 2. Production — Vercel environment variables

Vercel → your project → **Settings → Environment Variables**:

| Name                  | Value            | Environments                      |
| --------------------- | ---------------- | --------------------------------- |
| `BRIGHT_DATA_API_KEY` | _your key_       | Production, Preview, Development   |

Then **redeploy** (env var changes only take effect on a new deployment).

### 3. Any other place that runs ingestion

If you run the nightly ingestion cron or scripts on another host (e.g. a CI
runner or a separate worker), set `BRIGHT_DATA_API_KEY` there too. The key is the
only Bright Data secret required.

## Operations (one config, one provider, three operations)

A retailer is sourced three ways — the **operation** (not a separate scraper)
decides the Bright Data input payload. Amazon's single dataset
(`gd_l7q7dkf244hwjntr0`) backs all three:

| Operation        | Bright Data        | Input payload            | Used when                         |
| ---------------- | ------------------ | ------------------------ | --------------------------------- |
| `keyword_search` | Discover by keyword| `{ keyword, zipcode }`   | importing NEW products            |
| `url_lookup`     | Collect by URL     | `{ url, zipcode, language }` | refreshing KNOWN product pages |
| `upc_lookup`     | Discover by UPC    | `{ upc, zipcode }`       | exact-matching ACROSS retailers   |
| `sku_lookup`     | Discover by SKU    | `{ sku, zipcode }`       | exact-matching by retailer item id|

Per-retailer operation support (all config, no per-retailer scraper code):

| Retailer | dataset env                 | operations                              |
| -------- | --------------------------- | --------------------------------------- |
| Amazon   | `BRIGHT_DATA_DATASET_AMAZON`| keyword_search · url_lookup · upc_lookup |
| Walmart  | `BRIGHT_DATA_DATASET_WALMART`| keyword_search · url_lookup · sku_lookup |
| Target   | `BRIGHT_DATA_DATASET_TARGET`| keyword_search · url_lookup · upc_lookup |

Priority order: keyword → url → identity (upc/sku). The ingestion pipeline picks
the operation from intent (`import` → keyword_search, `refresh` → url_lookup,
`cross_retailer_match` → upc_lookup). Operations are generic — any retailer can
declare the same ones in `src/lib/pipeline/ingestion/retailer-config.ts` once
Bright Data supports them. There is exactly one Bright Data provider underneath;
the operation alone decides the input payload and discover semantics.

## Verifying the connection

- **Admin page:** visit `/admin/bright-data` and click **Test connection**.
- **API:** `GET /api/admin/bright-data/test` returns
  `{ ok, configured, status, detail }`. The key itself is never returned.

A green "✓ Connected" means the key is set and authenticated. Any failure is also
logged server-side with a `[bright-data]` prefix so it is easy to find in Vercel
logs.

## Error logging

All Bright Data failures throw/return a structured `BrightDataError` tagged with
the stage that failed (`config | trigger | poll | download`) and the HTTP status,
and ping failures are logged via `console.error("[bright-data] …")`. Search Vercel
logs for `[bright-data]` to diagnose.

## Security notes

- The key lives only in env vars (`.env.local` locally + Vercel in prod).
- `.env.local` is gitignored; do not commit real keys.
- `.env.example` ships a `your_bright_data_api_key_here` placeholder only.
