# Brand mark audit checklist

Run: `npm run audit:brand` (also runs checks in CI via `npm run build` → `brand:generate`).

## Single canonical file

- [x] `public/brand/mark.svg` is the only hand-edited mark
- [x] No `icon.svg`, stroke-outline house, or Lucide `Home` in brand UI
- [x] `BrandHomeMark` renders `/brand/mark.svg` (same file as favicon source)

## Generated exports (from mark.svg)

| File | Size | Use |
|------|------|-----|
| `mark-16.png` | 16×16 | Favicon readability audit |
| `mark-32.png` | 32×32 | Tab icon |
| `mark-180.png` | 180×180 | Apple touch |
| `mark-512.png` / `og-mark.png` | 512×512 | OG / social |
| `mark.ico` | 16+32 | Legacy favicon requests |

Legacy aliases `ss-tab-*` are regenerated for Safari cache compatibility.

## Automated checks

- PNG hashes match fresh resvg render from `mark.svg`
- 16px export has sufficient non-background pixels
- `mark.generated.ts` contains current house path
- No forbidden legacy asset paths on disk

## Manual visual check

Open `/debug/icons` — navbar SVG and 32px PNG should be unmistakably the same house.
