# Pantry Scout — Launch checklist

The product works end-to-end as a **demo**. To launch for real users and earn affiliate revenue, complete these two gaps:

---

## Gap 1: Live price data

**Today:** Prices come from a demo catalog (`src/lib/retailers/catalog.ts`) — realistic but not pulled from stores in real time.

**To launch:**

1. **Pick one data source first** (don’t do all 8 at once):
   - **Instacart** — many stores, one API (partner application)
   - **Impact / CJ** — Walmart, Target affiliate product feeds
   - **Amazon Product Advertising API** — Amazon Fresh / grocery ASINs

2. **Add a connector** next to the catalog:
   - Create `src/lib/retailers/connectors/walmart.ts` (etc.)
   - Implement `search(intent)` → `ProductSearchResults`
   - Keep the same `{ local, online }` split

3. **Cache prices** 15–60 minutes (Redis or in-memory) and show “Prices as of …” on cards.

4. **Legal:** Only use APIs/feeds you’re approved for. Avoid scraping without counsel.

**In-app reference:** Settings → Launch guide, or visit `/launch` when running locally.

---

## Gap 2: Affiliate IDs

**Today:** “View deal” links include UTM tags; partner IDs are empty until you add them.

**To launch:**

1. **Apply for programs:**
   | Store | Typical program |
   |--------|------------------|
   | Amazon | [Amazon Associates](https://affiliate-program.amazon.com/) |
   | Walmart | Impact.com → Walmart Affiliates |
   | Target | Target Partners (Impact) |
   | Kroger | Impact / brand-specific |
   | Costco, Sam’s | Often limited — check each |

2. **Create `.env.local`** in the project root (copy from `.env.example`):

```bash
AFFILIATE_AMAZON_TAG=your-tag-20
AFFILIATE_WALMART_TAG=your-walmart-id
AFFILIATE_TARGET_TAG=your-target-id
# ... etc
```

3. **Restart the dev server** after changing env vars:
   ```bash
   npm run dev
   ```

4. **Verify:** Click “View deal” → URL should include your tag (e.g. Amazon `?tag=`).

5. **Disclosure:** Footer + chat already state affiliate relationship. Keep this on all pages for FTC compliance.

---

## Deploy (when ready)

```bash
npm run build
```

Deploy folder `Pantry_Scout` to **Vercel**:

1. Push code to GitHub
2. Import project in Vercel
3. Add **Environment Variables** (same as `.env.local`)
4. Connect custom domain

---

## Optional next features

- Price drop alerts (email)
- User accounts (save lists across devices)
- Browser extension (“compare this page”)

---

**Questions only you can answer later:** custom domain name, which affiliate programs approved you first, and which metro to prioritize for local store accuracy.
