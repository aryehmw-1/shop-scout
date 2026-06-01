/**
 * Lightweight env loader for plain `node` scripts (no dotenv dependency).
 *
 * Loads, in precedence order (first wins, never overrides an already-set var):
 *   1. process.env (real shell environment)
 *   2. .env.local   (developer/local secrets — gitignored)
 *   3. .env         (committed defaults)
 *
 * Next.js loads .env.local automatically for the app runtime, but standalone
 * scripts run with `node scripts/foo.mjs` do NOT — which is why
 * `npm run test:proxy` previously reported configuredCount: 0 even though
 * .env.local was present.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.replace(/^export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;
    let value = withoutExport.slice(eq + 1).trim();
    // Strip a single layer of matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load env files into process.env. Returns the list of files actually loaded.
 * @param {{ files?: string[], verbose?: boolean }} [opts]
 */
export function loadEnv(opts = {}) {
  // .env.local takes precedence over .env (matches Next.js semantics).
  const files = opts.files ?? [".env.local", ".env"];
  const loaded = [];
  for (const file of files) {
    const fullPath = resolve(root, file);
    if (!existsSync(fullPath)) continue;
    const parsed = parseEnvFile(readFileSync(fullPath, "utf8"));
    let applied = 0;
    for (const [key, value] of Object.entries(parsed)) {
      // Never override an already-defined variable (shell env wins,
      // and earlier files in the list win over later ones).
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
        applied += 1;
      }
    }
    loaded.push({ file, keys: Object.keys(parsed).length, applied });
    if (opts.verbose) {
      console.log(`[load-env] ${file}: ${applied}/${Object.keys(parsed).length} vars applied`);
    }
  }
  if (opts.verbose && loaded.length === 0) {
    console.warn("[load-env] no env files found (.env.local / .env)");
  }
  return loaded;
}

export const ENV_ROOT = root;
