# Demo commerce — canonical comparison

High-confidence **canonical products** compared across multiple retailers. Quality over volume (~50 products, not thousands).

## Architecture

```text
CanonicalProduct
  canonical_id, canonical_title, canonical_image, canonical_category
  brand, normalized_keywords
  offers[] → RetailerOffer (amazon, walmart, target, costco, kroger, …)

Amazon PA-API  →  canonical metadata (title, image, category, ASIN)
Other retailers →  pricing + search/PDP URLs (validated per-offer confidence)
```

**Amazon** grounds identity. **Other retailers** supply offers only.

## Build catalog

```bash
# Requires AMAZON_PA_API_ACCESS_KEY, AMAZON_PA_API_SECRET_KEY, AMAZON_PA_API_PARTNER_TAG
npm run demo:build-canonical

# Rebuild from enrichment cache only (no API calls)
npm run demo:build-canonical:cache

# Options
npm run demo:build-canonical -- --max-seeds=50 --min-offers=2 --throttle-ms=1200
```

Output: `data/canonical-products.json` (+ uses `data/amazon-enrichment-cache.json`)

Commit both files for Vercel deploy.

## UI

| Route | Purpose |
|-------|---------|
| `/demo` | Canonical product grid |
| `/demo/products/[canonical_id]` | Same-product compare (header + offer cards) |
| `/compare?product=sony-wh1000xm5` | Compare page loaded from canonical API |

## Seeds

~50 curated products in `src/lib/demo-commerce/canonical/seeds.ts` (electronics, grocery, beauty, home, sports).

## Validation

Each `RetailerOffer` gets `confidence_score`. Offers are rejected when:

- Title semantic mismatch
- Retailer/category inconsistency  
- Low confidence (&lt;0.52)
- Invalid URL / price

Products need **≥2 valid offers** to publish.

## Legacy flat catalog

`data/products.json` and `npm run demo:bulk` remain for backwards compatibility. `/demo` prefers canonical catalog when `canonical-products.json` has published products.

## Impact feed → intelligence graph

Production-grade ingest (correctness over scale):

```bash
# Sample fixture (no API keys)
npm run demo:impact-ingest

# Your Impact export (Google Merchant TSV/CSV)
npm run demo:impact-ingest -- --file=path/to/catalog.tsv --catalog-id=my-catalog --advertiser=brand-x

# Impact API (IMPACT_ACCOUNT_SID + IMPACT_AUTH_TOKEN)
npm run demo:impact-ingest -- --use-api --impact-catalog-id=12345
```

Writes:

- `data/intelligence-graph/products/*.json` — per-canonical graph nodes + evidence
- `data/intelligence-graph/last-ingest-report.json` — match stats, rejections, orphan rate
- `data/canonical-products.json` — published graphs (≥2 validated offers) for `/demo` UI

Chat prefers **CommerceRetrievalPayload** when graph match confidence is sufficient.

### Trust UX & evaluation

- **TrustSummaryCard** — calm decision summary; **How we know this** or **Analyst mode** (winner rationale, candidates, counterfactuals, reasoning trace).
- **Purchase decision** — deterministic winner vs alternatives (confidence, landed value, freshness, stability).
- Preferences adjust **display ranking only** (not confidence scores).
- Full eval: `npm run demo:eval-intelligence` writes:
  - `eval-report.json` — graph quality metrics
  - `calibration-report.json` — confidence buckets, false positives, anomalies
  - `golden-suite-report.json` — golden query pass/fail
  - `calibration-history.json` — scores over time
- Golden queries: `data/eval/golden-queries.json` (extend as catalog grows)
- Regression gates in eval (exit 1 on failure): calibration floor, golden pass rate, hallucination grounding, decision presence.
- Trust memory (client): anonymous click/save aggregates — display ranking only.
- Debug APIs (dev): `/api/debug/intelligence-eval`, `/api/debug/intelligence-calibration`, `/api/debug/intelligence-drift`, `/api/debug/ai-router`
- Adversarial eval cases run inside full eval (`adversarial` block in report).

### Adaptive intelligence (Track A)

Deterministic layers (no LLM): longitudinal profiles, retailer reputation, market signals, stability forecast, structured memory (`data/intelligence-graph/structured-memory.json`), analyst pipeline (`workflow/analyst-pipeline.ts`).

Stable APIs:

- `GET /api/intelligence/v1/recommend?q=`
- `GET /api/intelligence/v1/trust/[canonicalId]`
- `GET /api/intelligence/v1/drift`
- `GET /api/intelligence/v1/retailers` · `?retailer=walmart`
- `GET /api/intelligence/v1/counterfactual/[canonicalId]`
- `GET /api/intelligence/v1/longitudinal`

`RecommendationExplanation.adaptive` feeds Analyst mode (stability, market, retailer panels).

### Multi-model routing (Track B)

Provider abstraction: `src/lib/ai/providers/` (OpenAI, Anthropic, Gemini, OpenRouter; Bedrock/Vertex/local stubs).

Router: `src/lib/ai/router/` — capability routing, instrumentation, escalation.

Orchestration: `src/lib/ai/orchestration/generate-text.ts` (`orchestratedGenerate`).

Enable routed chat replies: `AI_USE_ROUTER=1` (optional `AI_DEFAULT_PROVIDER`, `AI_ROUTER_DEBUG=1`).

Prompt tiers: `src/lib/ai/prompts/tiers.ts` · contracts: `src/lib/ai/contracts/validate.ts`.

### Beta experience

- First-visit onboarding explains recommendations, “Why this pick”, and “More detail” (chat).
- In-product feedback on each recommendation (useful / why not / bought).
- Session replay for operators: `/debug/intelligence-sessions` (enable `INTELLIGENCE_BETA_MODE=1`).
- Env: `NEXT_PUBLIC_BETA_MODE=1`, optional `NEXT_PUBLIC_MAINTENANCE_BANNER=We're updating prices…`

### Operator runbook

See [INTELLIGENCE_RUNBOOK.md](./INTELLIGENCE_RUNBOOK.md) for deployment checks, cron, failure recovery, and load smoke.

### Operations & reliability

- **Maintenance** (snapshots → longitudinal memory → compaction → lifecycle): runs after Impact ingest and full eval; cron:
  `GET /api/cron/intelligence-maintenance` · `?eval=1` for eval + gates.
- **Observability dashboard**: `/debug/intelligence-ops` · API: `/api/debug/intelligence-ops`
- **Behavioral feedback** (weak ranking only): `POST /api/intelligence/v1/feedback` + client sync from clicks.
- **Provider resilience**: circuit breaker, retry/backoff, provider fallback in `orchestratedGenerate`.
- **Adversarial regression gate**: `ADVERSARIAL_MIN_PASS_RATE` (default `1`).
- Env: `INTELLIGENCE_MAINTENANCE=0` to disable · `AI_SKIP_UNGROUNDED_LLM=1` to skip LLM without retrieval payload.

## Commands reference

```bash
npm run demo:impact-ingest     # Impact feed → intelligence graph (fixture by default)
npm run demo:build-canonical   # Amazon PA-API canonical seeds
npm run demo:enrich-amazon     # flat Amazon-first catalog (legacy path)
npm run demo:quality           # filter flat products.json
npm run demo:bulk              # adapters + enrichment (no matrix by default)
```
