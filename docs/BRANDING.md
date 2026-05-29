# Shop Scout branding

## Home mark (logo, chat, favicon)

Single visual: **orange → amber → rose gradient tile + house icon**.

| Use | Implementation |
|-----|----------------|
| Sidebar wordmark | `Logo` → `BrandHomeMark` |
| Chat assistant | `BrandHomeMark size="xs"` |
| Loading state | `BrandHomeMark pulse` |
| Browser tab | `src/app/icon.svg` (App Router file convention) |
| Apple touch | `src/app/apple-icon.svg` |
| PWA manifest | `src/app/manifest.ts` → `/brand/icon.svg` |
| Static copy | `public/brand/icon.svg` (keep in sync with `app/icon.svg`) |

Do **not** add `metadata.icons` in `layout.tsx` — that duplicated the old magnifying-glass asset and fought `app/icon.svg`.

## Compare nav only

`ShopScoutCompareIcon` — search + tag pulse next to **Compare prices** in `Sidebar` and `MobileNav` only.

## Cache busting (stale favicon in browser)

After icon changes:

1. Hard refresh (Cmd+Shift+R) or clear site data for localhost.
2. Restart dev server: `npm run clean && npm run dev`
3. Safari iOS: remove home-screen shortcut and re-add after deploy.

## Extension

Chrome extension `extension/manifest.json` has no icons yet; add `public/brand/icon.svg` paths when publishing to the store.
