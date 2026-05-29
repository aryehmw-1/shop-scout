# Icon audit checklist

Verified in repo:

- [x] No `favicon.ico` (avoids conflict with `app/icon.svg`)
- [x] No `metadata.icons` override in `layout.tsx`
- [x] `src/app/icon.svg` = home mark (matches Logo)
- [x] `src/app/apple-icon.svg` = same home mark
- [x] `public/brand/icon.svg` = same (manifest + static)
- [x] Removed `public/brand/shop-scout-icon.svg` (old magnifying-glass)
- [x] Removed `ShopScoutMark.tsx` (unused alternate)
- [x] No Lucide `Scale` in navigation
- [x] `ShopScoutCompareIcon` only on `/chat` nav items

## Contrast / DPI

- Home mark: white stroke on saturated gradient (WCAG-friendly on tile)
- SVG `viewBox="0 0 32 32"` scales cleanly on retina
- `BrandHomeMark` uses vector Lucide `Home` + CSS gradient (sharp at all DPR)

## Dark themes

User theme presets change page background, not the brand tile. Mark stays gradient + white icon on all themes.
