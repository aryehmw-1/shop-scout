/**
 * Nightly price index — run via cron (e.g. 2 AM).
 *
 *   npm run index:nightly
 *   npm run index:nightly -- --category=shoes --limit=50
 *
 * Requires DATABASE_URL. Amazon rows need AMAZON_PA_API_* in .env.
 * Other retailers are catalog estimates unless you add more APIs later.
 */
import { runNightlyPriceIndex } from "../src/lib/indexing/nightly-quotes";

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit?.split("=")[1];
}

async function main() {
  const category = argValue("--category");
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

  console.log("[nightly-index] starting…", { category, limit });

  const report = await runNightlyPriceIndex({
    category,
    limit: Number.isFinite(limit) ? limit : undefined,
    delayMs: 400,
  });

  console.log("[nightly-index] done", JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("[nightly-index] failed", e);
  process.exit(1);
});
