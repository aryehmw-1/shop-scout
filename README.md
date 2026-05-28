# Shop Scout

**Shop smart. Spend less.** Compare prices on groceries, clothing, shoes, sports gear, and more.

Walmart, Target, Amazon, Publix, Burlington, DICK'S Sporting Goods, Kroger, Costco, Aldi, Instacart, Sam's Club, and more.

## Run locally

```bash
cd Pantry_Scout
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features

- **Landing page** — conversion-focused hero, how-it-works, category shortcuts
- **AI chat** — describe what you need or paste a product URL
- **Smart follow-ups** — organic, budget, delivery (chip buttons)
- **Product cards** — photos, sale prices, unit pricing, affiliate links
- **Compare table** — store-by-store breakdown for link comparisons
- **Saved deals** — heart items, view on `/saved`
- **Settings** — ZIP, preferences, affiliate disclosure
- **Mobile nav** — thumb-friendly bottom bar

## Monetization

Affiliate links on every "View deal" / "Shop" button. Configure tags in `.env.local` (see `.env.example`).

## Production data

The catalog uses realistic demo pricing. Replace `src/lib/retailers/catalog.ts` connectors with live APIs (Instacart, Impact, Amazon PA-API) when partner access is ready — UI and affiliate layer stay the same.

## Deploy

```bash
npm run build
# Deploy to Vercel: connect repo and set env vars
```

## Stack

Next.js 16 · React 19 · Tailwind 4 · TypeScript · Lucide icons
