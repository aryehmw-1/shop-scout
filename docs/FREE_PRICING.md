# Pricing in Shop Scout (no SerpAPI)

SerpAPI has been removed. Live data comes from:

| Source | What it provides |
|--------|------------------|
| **Amazon PA-API** | Live **price + image** on the **Amazon** offer row |
| **SQLite cache** | Recent prices saved from past searches (`LIVE_PRICING_PROVIDER=cache`) |
| **Catalog model** | Estimated prices + retailer search links for all other stores |

## Recommended `.env`

```bash
LIVE_PRICING_PROVIDER=cache
AMAZON_PA_API_ACCESS_KEY=...
AMAZON_PA_API_SECRET_KEY=...
AMAZON_PA_API_PARTNER_TAG=yourtag-20
```

Use `LIVE_PRICING_PROVIDER=off` if you only want estimates and store links.

## Other retailers (Walmart, Target, Nike, …)

Real prices require each retailer’s **affiliate / partner API** (same idea as Amazon). Until those are added, cards show **estimated** prices and a link to search that store.

Check status: `GET /api/search/status`
