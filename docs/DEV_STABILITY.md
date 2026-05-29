# Dev server stability (Shop Scout)

## Symptom

Homepage keeps reloading; terminal shows:

```
Failed to write app endpoint /page
Next.js package not found
```

## Root cause (common on this machine)

Turbopack picks the **wrong project root** by walking up until it finds a `package-lock.json`.

If `/Users/future/package-lock.json` exists (parent of `Shop_Scout/`), Turbopack may treat `~/` as the repo root — where **`next` is not installed** — and crash in a loop.

`next.config.ts` now pins `turbopack.root` to the Shop Scout folder. You should still remove a stray parent lockfile if you do not need it:

```bash
# Only if this file is accidental (empty junk lockfile):
rm ~/package-lock.json
```

## Recommended dev commands

```bash
cd ~/Shop_Scout

# Clean caches (keeps node_modules unless you pass --reinstall)
npm run clean

# Stable dev (Webpack — default)
npm run dev

# Optional: try Turbopack again after parent lockfile is fixed
npm run dev:turbo
```

## Full reset

```bash
cd ~/Shop_Scout
rm -rf node_modules .next
npm install
npm run dev
```

Or:

```bash
npm run clean -- --reinstall   # if we add npm run clean with flag
node scripts/clean-dev.mjs --reinstall
npm run dev
```

## Node version

Use **Node 20 LTS** when possible (`.nvmrc` = 20). Node 24 often works but is less tested with Next 16.

```bash
nvm use
```

## Verify `next` is installed

```bash
cd ~/Shop_Scout
test -f node_modules/next/package.json && echo "next OK"
npm ls next
```

## Test trust/ranking UI

- Homepage: http://localhost:3000
- Chat: http://localhost:3000/chat
- Admin offer debug: http://localhost:3000/admin/offers
