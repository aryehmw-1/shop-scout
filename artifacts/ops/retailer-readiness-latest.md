# Retailer Readiness Report

Generated: 2026-05-31T02:59:57.652Z

## Platform positioning
- Product comparison
- Shopping intelligence
- Recommendation engine
- Commerce discovery
- Pricing aggregation

## Persistence
- Products: 78
- Products without active quotes: 78
- Expired quote ratio: 1

## Retailers

| Retailer | Status | Works | Method | Confidence | Persistence | Affiliate | Challenge | Active quotes |
|----------|--------|-------|--------|------------|-------------|-----------|-----------|---------------|
| Amazon | partial | no | official_api | 0.92 | empty | configured | 0.5 | 0 |
| Target | partial | no | cached_structured | 0.55 | empty | missing | 0.45 | 0 |
| Walmart | experimental | no | cached_structured | 0.45 | empty | n/a | 0.7 | 0 |
| kroger | blocked | no | cached_structured | 0.25 | empty | missing | 0.85 | 0 |
| costco | blocked | no | browser_rendered | 0.2 | empty | missing | 0.9 | 0 |

## Production gaps & next steps

### Amazon

**Gaps:**
- Amazon PA-API credentials not configured
- No active persisted quotes

**Next steps:**
- Set AMAZON_PA_API_ACCESS_KEY, SECRET_KEY, PARTNER_TAG
- Run npm run index:full:local with retailer images enabled

### Target

**Gaps:**
- Affiliate tag missing
- No active persisted quotes

**Next steps:**
- Configure /api/outbound env keys
- Run npm run index:full:local with retailer images enabled

### Walmart

**Gaps:**
- No active persisted quotes
- Browser-rendered path experimental — PerimeterX challenge rate high

**Next steps:**
- Run npm run index:full:local with retailer images enabled
- Use cached_structured + merchant feed; keep experiments observability-only

### kroger

**Gaps:**
- Affiliate tag missing
- No active persisted quotes

**Next steps:**
- Configure /api/outbound env keys
- Run npm run index:full:local with retailer images enabled

### costco

**Gaps:**
- Affiliate tag missing
- No active persisted quotes

**Next steps:**
- Configure /api/outbound env keys
- Run npm run index:full:local with retailer images enabled


## Orchestration metrics
- Residential usage: 0.0%
- Avg cost per success: 0
- Fallback frequency: 0.0%