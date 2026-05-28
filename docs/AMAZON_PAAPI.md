# Amazon Product Advertising API (PA-API 5.0)

Shop Scout uses Amazon’s **official** PA-API for live **Amazon** prices and product images when credentials are configured. Other retailers are not covered by Amazon’s API.

## Requirements

1. Join [Amazon Associates](https://affiliate-program.amazon.com/).
2. Apply for [Product Advertising API](https://webservices.amazon.com/paapi5/documentation/register-for-pa-api.html) on the same account.
3. After approval, create **Access Key** and **Secret Key** in Associates → Tools → Product Advertising API.

Amazon may deny or pause API access if your site has little traffic or no qualifying sales. That is an Amazon policy issue, not something Shop Scout can bypass.

## Environment variables

```bash
AMAZON_PA_API_ACCESS_KEY=your_access_key
AMAZON_PA_API_SECRET_KEY=your_secret_key
AMAZON_PA_API_PARTNER_TAG=yourtag-20
# Or reuse:
AFFILIATE_AMAZON_TAG=yourtag-20
```

Optional:

```bash
AMAZON_PA_API_HOST=webservices.amazon.com
AMAZON_PA_API_REGION=us-east-1
```

Restart the dev server after changing `.env`.

## Behavior

- **Search**: `SearchItems` with your chat query → best Amazon listing (price, image, affiliate URL).
- **Extension**: on `amazon.com` PDPs, `GetItems` by ASIN when possible.
- Merged into compare results with `priceSource: connector_api` and note “Live price · Amazon”.

## Rate limits

Amazon enforces daily request limits based on your shipped sales. See their PA-API documentation for current tiers.

## Troubleshooting

| Error | Action |
|-------|--------|
| InvalidPartnerTag | Use the exact Associate tag from your dashboard (`xxx-20`). |
| AccessDenied / Not authorized | PA-API not approved yet, or keys from wrong account. |
| TooManyRequests | Wait or increase sales tier with Amazon. |
