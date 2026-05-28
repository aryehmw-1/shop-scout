# Amazon Associates — website requirement

Amazon requires a **live, public website** with real content before approving Associates and Product Advertising API access. `localhost` does not count.

## Pages Amazon reviewers expect

Shop Scout includes these public routes:

| URL | Purpose |
|-----|---------|
| `/` | Homepage — what the site does |
| `/about` | About the service |
| `/chat` | Main product (price comparison) |
| `/affiliate-disclosure` | FTC + Amazon Associates disclosure |
| `/privacy` | Privacy policy |
| `/terms` | Terms of use |
| `/contact` | Contact email |

## Deploy free on Vercel (~10 minutes)

1. Push your code to **GitHub** (private repo is fine).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Framework preset: **Next.js** (auto-detected).
4. Environment variables (minimum):

   ```bash
   DATABASE_URL=file:./data/shop-scout.db
   AUTH_SECRET=generate-a-long-random-string
   NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
   NEXT_PUBLIC_CONTACT_EMAIL=you@yourdomain.com
   ```

5. Deploy. Copy your URL, e.g. `https://shop-scout-abc.vercel.app`.

6. Open in a browser and confirm `/`, `/about`, `/privacy`, `/affiliate-disclosure` load.

## What to enter on the Amazon application

| Field | Example |
|-------|---------|
| **Website URL** | `https://your-project.vercel.app` |
| **Site description** | Price comparison across major retailers; users compare groceries, clothing, shoes, and home products. |
| **Content** | Original comparison tool + about/affiliate pages (not a parked domain). |

Use the **same URL** on your PA-API application.

## Optional: custom domain

Buy a domain (Namecheap, Cloudflare, etc.) → add it in Vercel → set:

```bash
NEXT_PUBLIC_APP_URL=https://shopscout.com
```

Update contact email to match your domain for a more professional look.

## Before you apply

- [ ] Site is **public** (not password-protected).
- [ ] Footer links to **Privacy** and **Affiliate disclosure**.
- [ ] `/about` explains what you do and mentions Amazon Associates.
- [ ] Contact email works or forwards to you (`NEXT_PUBLIC_CONTACT_EMAIL`).
- [ ] Homepage has a clear **Compare prices** call to action.

## After approval

Add to production `.env`:

```bash
AMAZON_PA_API_ACCESS_KEY=...
AMAZON_PA_API_SECRET_KEY=...
AMAZON_PA_API_PARTNER_TAG=yourtag-20
```

See [AMAZON_PAAPI.md](./AMAZON_PAAPI.md).
