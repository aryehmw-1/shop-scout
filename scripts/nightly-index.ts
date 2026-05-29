/**
 * Daily price + photo check — run once per day (cron at 2 AM).
 *
 *   npm run index:daily
 *   npm run index:daily -- --category=shoes --limit=50
 *   INDEX_FETCH_RETAILER_IMAGES=true npm run index:full:local -- --limit=3
 *
 * Progress logs: on by default ([index HH:MM:SS] …). Set INDEX_PROGRESS=off to quiet.
 *
 * See docs/OWN_DATABASE.md
 */
import { runNightlyPriceIndex } from "../src/lib/indexing/nightly-quotes";
import { getFullIndexRotationPlan } from "../src/lib/indexing/weekly-retailer-schedule";
import {
  isValidProxyUrl,
  warnIfProxyMisconfigured,
} from "../src/lib/offers/retailer-adapters/retailer-fetch";

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit?.split("=")[1];
}

async function main() {
  const category = argValue("--category");
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
  const fullIndex =
    process.argv.includes("--full") ||
    process.env.WEEKLY_STORE_ROTATION === "off";

  warnIfProxyMisconfigured();
  const proxyRaw = process.env.INDEX_PROXY_LIST?.trim() || process.env.INDEX_PROXY_URL?.trim();
  const proxyStatus =
    !proxyRaw ? "(not set)"
    : isValidProxyUrl(proxyRaw.split(/[,;\n|]+/)[0]!.trim()) ? "(set, valid)"
    : "(set, INVALID — placeholder ignored)";

  console.log("[nightly-index] starting…", { category, limit, fullIndex });
  console.log("[nightly-index] env", {
    INDEX_FETCH_RETAILER_IMAGES: process.env.INDEX_FETCH_RETAILER_IMAGES ?? "(default: on)",
    INDEX_OFFER_ENRICHMENT: process.env.INDEX_OFFER_ENRICHMENT ?? "(follows images flag)",
    INDEX_SCRAPE_SKIP_RETAILERS:
      process.env.INDEX_SCRAPE_SKIP_RETAILERS ?? "(default: hm)",
    INDEX_RETAILER_ADAPTERS:
      process.env.INDEX_RETAILER_ADAPTERS ??
      "(default: on — walmart,target,amazon,aldi,kroger,costco)",
    INDEX_AMAZON_PAAPI_FALLBACK:
      process.env.INDEX_AMAZON_PAAPI_FALLBACK ?? "(default: on if PA-API configured)",
    INDEX_PROXY_LIST: proxyStatus,
    INDEX_PROGRESS: process.env.INDEX_PROGRESS ?? "(default: on)",
    INDEX_ENRICHMENT_REPORT: process.env.INDEX_ENRICHMENT_REPORT ?? "(default: on when PIPELINE_DEBUG)",
    INDEX_CORE_RETAILERS_ONLY: process.env.INDEX_CORE_RETAILERS_ONLY ?? "(default: on — amazon,walmart,target,costco,kroger)",
    SKIP_CATALOG_SYNC: process.env.SKIP_CATALOG_SYNC ?? "0",
    DATABASE_URL: process.env.DATABASE_URL?.replace(/file:(.*)/, "file:…") ?? "(prisma default)",
  });
  console.log(
    "[nightly-index] tip: first run often sits on catalog-sync (DB) before product 1/70. Use --limit=3 to test.",
  );

  const report = await runNightlyPriceIndex({
    category,
    limit: Number.isFinite(limit) ? limit : undefined,
    delayMs: 400,
    rotationPlan: fullIndex ? getFullIndexRotationPlan() : undefined,
  });

  console.log("[nightly-index] done", JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("[nightly-index] failed", e);
  process.exit(1);
});
