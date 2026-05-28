# Shop Scout browser extension

Compare the product on your current tab against other stores via your Shop Scout server.

## Install (Chrome / Edge)

1. Start Shop Scout: `npm run dev` (default `http://localhost:3000`).
2. Open `chrome://extensions` → **Developer mode** → **Load unpacked**.
3. Select this folder: `extension/`.
4. Pin **Shop Scout** in the toolbar.

## Use

1. Open a product page (Amazon, Walmart, Target, Nike, Kohl's, Macy's, Costco).
2. Click the Shop Scout icon → **Compare prices**.
3. Results show other retailers; **Open in Shop Scout** opens full chat results.

## Settings

- **Shop Scout server**: your app URL (`http://localhost:3000` or production).
- Saved in extension storage (`chrome.storage.sync`).

## APIs used

- `GET /api/extension/config`
- `POST /api/extension/compare` — sends page URL, title, price, Amazon ASIN when detected.

## Amazon live prices

Configure on the server (not in the extension):

```bash
AMAZON_PA_API_ACCESS_KEY=
AMAZON_PA_API_SECRET_KEY=
AMAZON_PA_API_PARTNER_TAG=yourtag-20
```

See `docs/AMAZON_PAAPI.md`.
