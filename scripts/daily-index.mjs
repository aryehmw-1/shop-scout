/**
 * Daily index runner — works without tsx (uses HTTP if app is running).
 *
 *   node scripts/daily-index.mjs
 *   node scripts/daily-index.mjs --full          # all 156 retailers
 *   BASE_URL=http://127.0.0.1:3003 node scripts/daily-index.mjs --full
 */
const SECRET = process.env.CRON_SECRET?.trim();
const fullIndex =
  process.argv.includes("--full") ||
  process.env.WEEKLY_STORE_ROTATION === "off";

async function resolveBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  for (const port of [3000, 3001, 3002, 3003]) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 2500);
      const r = await fetch(`${url}/api/search/status`, { signal: c.signal });
      if (r.ok) return url;
    } catch {
      /* try next port */
    }
  }
  return "http://127.0.0.1:3000";
}

async function viaHttp(baseUrl) {
  const path = fullIndex ? "/api/cron/daily-index?full=1" : "/api/cron/daily-index";
  const headers = {};
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

async function main() {
  const base = await resolveBaseUrl();
  console.log(
    `[daily-index] calling ${base}/api/cron/daily-index${fullIndex ? "?full=1" : ""} …`,
  );
  try {
    const report = await viaHttp(base);
    console.log("[daily-index] done", JSON.stringify(report, null, 2));

    if (fullIndex && report.weeklyRotation !== false && report.retailersTonight !== report.totalRetailers) {
      console.warn(
        "\n⚠ Full index did not run all retailers.",
        `Got ${report.retailersTonight}/${report.totalRetailers}.`,
        "Restart dev server after pulling latest code, then run:",
        "\n  npm run index:full",
      );
      process.exit(1);
    }
  } catch (e) {
    console.warn("[daily-index] HTTP failed:", e.message);
    if (fullIndex) {
      console.log("[daily-index] falling back to direct index (no dev server) …");
      const { execSync } = await import("node:child_process");
      const { dirname, join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const root = join(dirname(fileURLToPath(import.meta.url)), "..");
      try {
        execSync(
          "npx tsx scripts/nightly-index.ts --full",
          {
            cwd: root,
            stdio: "inherit",
            env: {
              ...process.env,
              WEEKLY_STORE_ROTATION: "off",
              INDEX_FETCH_RETAILER_IMAGES:
                process.env.INDEX_FETCH_RETAILER_IMAGES ?? "true",
            },
          },
        );
        return;
      } catch (fallbackErr) {
        console.error("[daily-index] direct fallback failed:", fallbackErr.message);
      }
    }
    console.error(
      "\nStart the app:  npm run dev",
      "\nThen:  npm run index:full",
      "\nOr always direct:  npm run index:full:local",
      "\nWith images:  INDEX_FETCH_RETAILER_IMAGES=true npm run index:full:local",
    );
    process.exit(1);
  }
}

main();
