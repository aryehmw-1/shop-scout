# Phase 0 retailer diagnostics

Generated: 2026-05-29T17:33:02.010Z

Offers written: **18** · Products indexed: **18**

## Retailer fetch diagnostics

Proxy configured: **NO — Walmart/Target/Kroger will fail without INDEX_PROXY_LIST**

| Retailer | Attempts | OK | Fail | Proxy used | Top failure reasons |
|----------|--------:|---:|-----:|-----------:|---------------------|
| walmart | 88 | 0 | 88 | 0 | walmart-bot-wall(88) |
| target | 66 | 0 | 66 | 0 | target-empty-or-blocked(66) |
| kroger | 66 | 0 | 66 | 0 | http-403(66) |
| costco | 50 | 16 | 34 | 0 | http-403(33), network-TypeError: fetch failed(1) |
| amazon | 29 | 29 | 0 | 0 | — |

## Persist outcomes

- **aldi**: persisted=0 · rejected: non_persistable_source:22
- **sams**: persisted=0 · rejected: non_persistable_source:22
- **costco**: persisted=0 · rejected: non_persistable_source:22
- **meijer**: persisted=0 · rejected: non_persistable_source:22
- **jewelosco**: persisted=0 · rejected: non_persistable_source:22
- **vons**: persisted=0 · rejected: non_persistable_source:22
- **safeway**: persisted=0 · rejected: non_persistable_source:22
- **heb**: persisted=0 · rejected: non_persistable_source:22
- **walmart**: persisted=0 · rejected: non_persistable_source:22
- **target**: persisted=0 · rejected: non_persistable_source:22
- **albertsons**: persisted=0 · rejected: non_persistable_source:22
- **weismarkets**: persisted=0 · rejected: non_persistable_source:22
- **wegmans**: persisted=0 · rejected: non_persistable_source:22
- **giantfood**: persisted=0 · rejected: non_persistable_source:22
- **hyvee**: persisted=0 · rejected: non_persistable_source:22
- **sprouts**: persisted=0 · rejected: non_persistable_source:22
- **thrivemarket**: persisted=0 · rejected: non_persistable_source:22
- **kroger**: persisted=0 · rejected: non_persistable_source:22
- **amazon**: persisted=18 · rejected: non_persistable_source:4
- **publix**: persisted=0 · rejected: non_persistable_source:22
- **stopandshop**: persisted=0 · rejected: non_persistable_source:22
- **freshdirect**: persisted=0 · rejected: non_persistable_source:22
- **instacart**: persisted=0 · rejected: non_persistable_source:22
- **wholefoods**: persisted=0 · rejected: non_persistable_source:22
