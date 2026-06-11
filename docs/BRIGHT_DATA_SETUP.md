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
