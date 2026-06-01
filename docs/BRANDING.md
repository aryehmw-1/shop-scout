# Shop Scout branding

## Single source of truth

**`public/brand/mark.svg`** — the only hand-edited brand mark file.

All other assets are generated:

```bash
npm run brand:generate   # runs automatically before build
npm run audit:brand      # consistency checks
```

| Use | Asset |
|-----|-------|
| Navbar, chat avatar, loading | `/brand/mark.svg` via `BrandHomeMark` |
| Browser tab (32px) | `/brand/mark-32.png` |
| Favicon ICO | `/brand/mark.ico` |
| Apple touch | `/brand/mark-180.png` |
| Open Graph / Twitter | `/brand/og-mark.png` |
| PWA manifest | `/brand/mark-180.png`, `/brand/mark-32.png`, `/brand/mark.svg` |

## Rules

- Do **not** use Lucide `Home` or stroke-outline house icons for brand marks
- Do **not** duplicate SVG paths in TS files — edit `mark.svg` only
- Do **not** add `public/brand/icon.svg` or other parallel marks
- Run `npm run audit:brand` after any brand change

## Visual debug

`/debug/icons` — side-by-side navbar mark vs 32px tab PNG
