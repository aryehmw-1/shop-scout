# How to practice the Shop Scout demo

**Shop Scout** is ready to demo on your computer. Prices are sample data for practice — not live store feeds yet.

---

## 1. Start the app

Open Terminal and run:

```bash
cd /Users/future/Pantry_Scout
npm run dev
```

Open your browser to: **http://localhost:3000**

---

## 2. Set your location (required)

1. Go to **Shop** (chat) or click **Start shopping**.
2. A popup asks for your **ZIP code** (e.g. `10001`, `90210`, `78701`).
3. Click **Start comparing prices**.

You can change ZIP anytime via the **ZIP** button in the chat header or **Settings**.

---

## 3. Demo script (5 minutes)

### A — Conversational search (two rows)

1. Type: `I'm looking for salad greens for the week`
2. Answer the chips if asked (organic, budget, delivery).
3. You should see **two rows**:
   - **Closest to you — best prices** (Walmart, Target, Kroger, etc. near your ZIP)
   - **Online shopping — best prices** (Amazon, Instacart, etc. — ships to you, including stores not physically nearby)

### B — Link comparison (same item, all stores)

1. Type or paste:
   ```
   https://www.walmart.com/product/organic-baby-spinach-10oz
   ```
2. You get the **same product** in both rows — local stores vs online.
3. Toggle **table view** (list icon) to see store-by-store prices.

### C — Quick chips

Try: `Organic milk under $5` or `Cheapest eggs near me`

### D — Save a deal

Click the **heart** on any product → open **Saved** in the bottom nav.

### E — Home page

Go **Home** → try category tiles (Salads, Dairy, etc.) — they open chat with a starter message.

---

## 4. What to say when demoing to someone

> "Shop Scout asks for your ZIP, then shows two things: the best prices at stores **near you**, and the best **online** prices that **ship to your door** — even if that chain doesn't have a store in your town. Paste any product link and we compare the same item everywhere."

---

## 5. If something doesn’t work

| Issue | Fix |
|--------|-----|
| No results | Enter a 5-digit ZIP first |
| Port in use | Run `npm run dev -- -p 3001` and open http://localhost:3001 |
| Blank images | Check internet (photos load from Unsplash) |
| Stale UI | Hard refresh: Cmd+Shift+R (Mac) |

---

## 6. Before a real launch

See **LAUNCH.md** for live price data and affiliate ID setup.
