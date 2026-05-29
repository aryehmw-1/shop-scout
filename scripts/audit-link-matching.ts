#!/usr/bin/env node --import tsx/esm
/**
 * Audit pasted-link matching quality with sample URLs.
 *
 *   npm run audit:links
 */
import { ingestLinkProduct } from "../src/lib/matching/link-ingest";
import { writeFileSync } from "fs";
import { join } from "path";

const SAMPLE_LINKS = [
  "https://www.amazon.com/dp/B000RKVM6A",
  "https://www.walmart.com/ip/Great-Value-Whole-Milk-Gallon/10450118",
  "https://www.target.com/p/organic-bananas/-/A-13276134",
];

interface LinkAuditRow {
  url: string;
  ok: boolean;
  matchTier?: string;
  matchConfidence?: number;
  pdpFetchOk?: boolean;
  priceVerified?: boolean;
  useExactCompare?: boolean;
  reasons?: string[];
  variantWarning?: string;
  latencyMs?: number;
}

async function main() {
  const rows: LinkAuditRow[] = [];
  let exact = 0;
  let near = 0;
  let failed = 0;
  let pdpOk = 0;

  for (const url of SAMPLE_LINKS) {
    const ingest = await ingestLinkProduct(url);
    if (!ingest) {
      rows.push({ url, ok: false });
      failed += 1;
      continue;
    }
    if (ingest.matchTier === "exact") exact += 1;
    else if (ingest.matchTier === "near") near += 1;
    else failed += 1;
    if (ingest.pdpFetchOk) pdpOk += 1;

    rows.push({
      url,
      ok: true,
      matchTier: ingest.matchTier,
      matchConfidence: ingest.matchConfidence,
      pdpFetchOk: ingest.pdpFetchOk,
      priceVerified: ingest.priceVerified,
      useExactCompare: ingest.useExactCompare,
      reasons: ingest.equivalenceReasons,
      variantWarning: ingest.variantWarning,
      latencyMs: ingest.ingestLatencyMs,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    samples: rows.length,
    exactRate: rows.length ? exact / rows.length : 0,
    nearRate: rows.length ? near / rows.length : 0,
    failRate: rows.length ? failed / rows.length : 0,
    pdpFetchRate: rows.length ? pdpOk / rows.length : 0,
    rows,
  };

  const md = [
    "# Link matching audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Metric | Rate |",
    "|--------|-----:|",
    `| Exact match | ${(report.exactRate * 100).toFixed(0)}% |`,
    `| Near match | ${(report.nearRate * 100).toFixed(0)}% |`,
    `| Failed | ${(report.failRate * 100).toFixed(0)}% |`,
    `| PDP fetch OK | ${(report.pdpFetchRate * 100).toFixed(0)}% |`,
    "",
    "## Samples",
    "",
    ...rows.map(
      (r) =>
        `- **${r.url.slice(0, 60)}…** — ${r.ok ? `${r.matchTier} (${r.matchConfidence}) pdp=${r.pdpFetchOk}` : "FAILED"}`,
    ),
  ].join("\n");

  console.log(md);
  writeFileSync(join(process.cwd(), "docs", "LINK_MATCHING_AUDIT.md"), md, "utf8");
  console.error("\n[audit:links] wrote docs/LINK_MATCHING_AUDIT.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
