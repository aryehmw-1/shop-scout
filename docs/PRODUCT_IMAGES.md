# Product images in Shop Scout

Shop Scout does **not** use SerpAPI or Google image search APIs.

## Where photos come from

| Source | Used for |
|--------|----------|
| **Catalog** | Default image on each product in our database |
| **Amazon PA-API** | **Amazon row only** — real listing image when PA-API credentials are set |
| **Open Food Facts** | Grocery items with a UPC |
| **Openverse** | Free fallback hero image when nothing else is available |

## Why Amazon is not enough for every store

Amazon PA-API only returns data for **Amazon.com listings**. When you compare Target, Walmart, Nike, etc., those cards do **not** get images from Amazon — they use the catalog image or Openverse.

There is no single free API that returns official product photos for every retailer. To improve non-Amazon photos later: add better images to the catalog, or integrate each retailer’s affiliate product API.

## Amazon setup

See [AMAZON_PAAPI.md](./AMAZON_PAAPI.md).
