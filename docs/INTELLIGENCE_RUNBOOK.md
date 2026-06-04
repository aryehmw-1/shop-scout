# Intelligence platform — operator runbook

## Architecture (at a glance)

```mermaid
flowchart LR
  ingest[Impact ingest] --> graph[Intelligence graph]
  graph --> deterministic[Deterministic reasoning]
  deterministic --> ux[Trust UX]
  graph --> llm[LLM augmentation optional]
  llm --> ux
  eval[Eval + gates] --> graph
  maintenance[Maintenance cron] --> memory[Longitudinal memory]
```

**Source of truth:** intelligence graph + deterministic pipelines. LLMs augment chat copy only.

## Environment setup

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Protect `/api/cron/*` in production |
| `ALLOW_DEBUG_ROUTES=1` | Enable `/api/debug/*` and `/debug/*` dashboards in prod |
| `INTELLIGENCE_MAINTENANCE=0` | Disable scheduled learning |
| `ADVERSARIAL_MIN_PASS_RATE` | Adversarial regression gate (default `1`) |
| `QUALITY_MIN_SCORE` | Recommendation quality gate (default `0.65`) |
| `AI_USE_ROUTER=1` | Multi-provider chat routing |
| `AI_SKIP_UNGROUNDED_LLM=1` | Skip LLM when no retrieval payload |
| `INTELLIGENCE_EXPERIMENTS=0` | Disable A/B trust-summary variants |
| `EXPERIMENT_TRUST_SUMMARY_STYLE` | Force `control` \| `a` \| `b` |
| `EXPERIMENT_TRUST_FRAMING` | Primary line + uncertainty order |
| `EXPERIMENT_UNCERTAINTY_TONE` | Calm uncertainty phrasing |
| `EXPERIMENT_ONBOARDING_COPY` | First onboarding screen copy |
| `BETA_ALERT_*` | Thresholds for beta ops alerts (see `ops/beta-alerts.ts`) |

Validate deployment:

```bash
curl -s "$BASE_URL/api/intelligence/v1/health" | jq
```

## Daily operations

### Ingest

```bash
npm run demo:impact-ingest
```

Runs row validation, duplicate detection, stale cleanup, graph recompute, and maintenance.

### Evaluation

```bash
npm run demo:eval-intelligence
```

Writes reports under `data/intelligence-graph/` and fails (exit 1) if regression gates fail.

### Scheduled maintenance (production)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE_URL/api/cron/intelligence-maintenance"

# Full eval + gates:
curl -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE_URL/api/cron/intelligence-maintenance?eval=1"
```

## Observability

| Surface | URL |
|---------|-----|
| Ops dashboard | `/debug/intelligence-ops` |
| Ops API | `/api/debug/intelligence-ops` |
| Router metrics | `/api/debug/ai-router` |
| Full eval JSON | `/api/debug/intelligence-eval` |

## Failure recovery

| Symptom | Action |
|---------|--------|
| Regression gates fail | Read `regression-gates.json`, fix graph/golden data, re-run eval |
| LLM outages | Recommendations still work; chat uses `fallbackReply`. Set `AI_SKIP_UNGROUNDED_LLM=1` |
| Provider circuit open | Wait for cooldown or check `/api/debug/ai-router` |
| Stale offers | Re-ingest or run maintenance; ingest runs `cleanupStaleGraphData` |
| Rate limit 429 on APIs | Back off clients; limits are per-IP per minute |

## Load & session simulation

```bash
npm run demo:intelligence-load-smoke
npm run demo:intelligence-session-sim
```

Session sim covers: deploy verify, health, recommend paths, concurrency, ambiguous queries, ingest stress, maintenance, safe-mode flags.

## Pre-deploy verification

```bash
npm run verify:build          # typecheck + critical module paths (runs before `npm run build`)
npm run demo:deploy-verify    # verify:build + intelligence smoke + module manifest
# or (runtime, needs ALLOW_DEBUG_ROUTES)
curl -s http://localhost:3000/api/debug/deploy-verify | jq
```

`deploy-verify` fails if critical files under `CRITICAL_MODULE_PATHS` are missing (prevents dangling imports that only fail at `next build`).

## Launch flags

| Flag | Env |
|------|-----|
| Intelligence search | `INTELLIGENCE_ENABLED=0` to disable |
| Safe / deterministic only | `INTELLIGENCE_SAFE_MODE=1` |
| Analytics | `INTELLIGENCE_ANALYTICS=0` to disable |
| Graph query cache TTL | `INTELLIGENCE_GRAPH_CACHE_MS=30000` |

## Beta rollout

| Env | Purpose |
|-----|---------|
| `NEXT_PUBLIC_BETA_MODE=1` | Beta banner + onboarding tone |
| `NEXT_PUBLIC_BETA_COHORT` | Default cohort tag: `internal` \| `trusted_beta` \| `category_validation` \| `gradual` \| `general` |
| `?cohort=internal` | Per-browser cohort override (stored in sessionStorage) |
| `INTELLIGENCE_BETA_MODE=1` | Session replay storage |
| `INTELLIGENCE_SESSION_REPLAY_QUERIES=1` | Truncated query preview in replay (internal) |
| `NEXT_PUBLIC_MAINTENANCE_BANNER=...` | Site-wide maintenance message |
| `NEXT_PUBLIC_SKIP_INTEL_ONBOARDING=1` | Disable first-visit onboarding |

**Rollout pattern:** set cohort per deployment or invite link (`/chat?cohort=trusted_beta`), keep `verify:build` + `demo:deploy-verify` in CI before each cohort push.

**Product URLs:** `/demo` catalog · `/demo/products/{canonical_id}` compare + trust card + recommendation history.

**Catalog stability:**

```bash
npm run demo:build-canonical   # writes data/canonical-products.json
```

| Env | Purpose |
|-----|---------|
| `BETA_MIN_CANONICAL_PRODUCTS` | Minimum published products for `demoReady` (default 5) |
| `BETA_CATALOG_STALE_HOURS` | Stale warning threshold (default 336h) |
| `REQUIRE_CANONICAL_CATALOG=1` | `demo:deploy-verify` fails if catalog below minimum |

Ops: `/api/debug/intelligence-ops` → `beta.summary` (concise bullets) · `beta.runtime` (safety checks).

## Product learning

- **Usefulness report:** `/api/debug/intelligence-usefulness`
- **Interpretation layer:** `/api/debug/intelligence-ops` → `interpretation` field
- **Beta learning snapshot:** `/api/debug/intelligence-ops` → `beta.learning` (outcomes, friction, retention, comparison, product value)
- **Beta alerts:** `/api/debug/intelligence-ops` → `beta.alerts` (negative feedback, disagreement, abandonment, latency)
- **Session replay:** `/debug/intelligence-sessions` (anonymized, no accounts)
- **In-product feedback:** `POST /api/intelligence/v1/product-feedback`

Tracked for controlled beta validation: return sessions, winner vs alternative clicks, onboarding completion/skip, trust-detail engagement, session abandon (no match after query).

Privacy: no names, emails, or payment data in intelligence analytics. Session IDs are random per browser session. Query text is category-bucketed unless `INTELLIGENCE_SESSION_REPLAY_QUERIES=1` (truncated).

## API boundaries

- Version header: `X-Intelligence-API-Version: 1.0.0`
- Request tracing: `X-Request-Id` on all responses
- Structured errors: `{ error: { code, message, requestId } }`
- Rate limits: per-route (see `ops/api-guard.ts`)

## Data files

| Path | Contents |
|------|----------|
| `data/intelligence-graph/products/` | Per-canonical graphs |
| `structured-memory.json` | Longitudinal / trust memory |
| `analytics-events.json` | Product interaction analytics |
| `behavioral-feedback.json` | Server-side weak ranking signals |
| `*-report.json` | Latest eval/calibration/drift/quality |

## Related docs

- [DEMO_COMMERCE.md](./DEMO_COMMERCE.md) — demo flows
- [COMMERCE_INTELLIGENCE_ARCHITECTURE.md](./COMMERCE_INTELLIGENCE_ARCHITECTURE.md) — system design
