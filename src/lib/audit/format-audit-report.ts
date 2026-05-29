import type { OperationalAuditReport } from "./operational-audit";

function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

function fmtRate(r: number | null): string {
  return r != null ? `${(r * 100).toFixed(0)}%` : "—";
}

export function formatAuditMarkdown(report: OperationalAuditReport): string {
  const c = report.coverage;
  const lines: string[] = [];

  lines.push("# Shop Scout Operational Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("> Honest production readiness — catalog entries ≠ production-usable products.");
  lines.push("");

  lines.push("## 1. Product coverage inventory");
  lines.push("");
  lines.push("| Metric | Count | % of catalog |");
  lines.push("|--------|------:|-------------:|");
  lines.push(`| Total catalog products | ${c.totalCatalogProducts} | 100% |`);
  lines.push(`| Canonical catalog IDs | ${c.totalCanonicalCatalogIds} | 100% |`);
  lines.push(`| With active verified offers | ${c.withVerifiedOffers} | ${pct(c.withVerifiedOffers, c.totalCatalogProducts)} |`);
  lines.push(`| Expired verified (needs re-index) | ${c.withExpiredVerifiedOffers} | ${pct(c.withExpiredVerifiedOffers, c.totalCatalogProducts)} |`);
  lines.push(`| Estimated only (no verified) | ${c.withEstimatedOnly} | ${pct(c.withEstimatedOnly, c.totalCatalogProducts)} |`);
  lines.push(`| Zero usable offers | ${c.withZeroUsableOffers} | ${pct(c.withZeroUsableOffers, c.totalCatalogProducts)} |`);
  lines.push(`| Stale verified (>48h) | ${c.withStaleOffers} | ${pct(c.withStaleOffers, c.totalCatalogProducts)} |`);
  lines.push(`| High-confidence matching (≥0.8) | ${c.withHighConfidenceMatching} | ${pct(c.withHighConfidenceMatching, c.totalCatalogProducts)} |`);
  lines.push(`| **Production-usable** | **${c.productionUsable}** | **${pct(c.productionUsable, c.totalCatalogProducts)}** |`);
  lines.push("");

  lines.push("### By category");
  lines.push("");
  lines.push("| Category | Catalog | Verified | Est. only | Zero | Stale | High conf | Prod-usable | Avg retailers |");
  lines.push("|----------|--------:|---------:|----------:|-----:|------:|----------:|------------:|--------------:|");
  for (const row of c.byCategory) {
    lines.push(
      `| ${row.category} | ${row.catalogCount} | ${row.verified} | ${row.estimatedOnly} | ${row.zeroOffers} | ${row.stale} | ${row.highConfidence} | ${row.productionUsable} | ${row.avgRetailerDiversity.toFixed(1)} |`,
    );
  }
  lines.push("");

  lines.push("## 2. Retailer reliability matrix");
  lines.push("");
  lines.push("| Retailer | Class | Trust | Scrape | Parser | Image | Verified % | Latency | Verified quotes | Data |");
  lines.push("|----------|-------|------:|-------:|-------:|------:|-----------:|--------:|----------------:|------|");
  for (const r of report.retailers) {
    lines.push(
      `| ${r.retailerId} | ${r.classification} | ${r.trustScore.toFixed(2)} | ${fmtRate(r.scrapeSuccessRate)} | ${fmtRate(r.parserStabilityScore)} | ${fmtRate(r.imageExtractionRate)} | ${fmtRate(r.verifiedPriceRate)} | ${r.avgLatencyMs != null ? `${Math.round(r.avgLatencyMs)}ms` : "—"} | ${r.verifiedQuoteCount} | ${r.dataSource} |`,
    );
  }
  lines.push("");

  lines.push("## 3. Product quality grading");
  lines.push("");
  lines.push("| Grade | Count | % |");
  lines.push("|-------|------:|--:|");
  for (const [g, n] of Object.entries(report.gradeDistribution)) {
    lines.push(`| ${g} | ${n} | ${pct(n, c.totalCatalogProducts)} |`);
  }
  lines.push("");

  lines.push("## 4. Scalability analysis");
  lines.push("");
  const s = report.scalability;
  lines.push(`- **Current:** ${s.currentProducts} products, ${s.currentQuotes} quote rows`);
  lines.push(`- **Index runtime:** ${s.indexingRuntimeGrowth}`);
  lines.push(`- **Scrape concurrency:** ${s.scrapeConcurrency}`);
  lines.push(`- **Anti-bot:** ${s.antiBotExposure}`);
  lines.push("");
  lines.push("**Scales linearly:** " + s.scalesLinearly.join("; "));
  lines.push("");
  lines.push("**Scales poorly:** " + s.scalesPoorly.join("; "));
  lines.push("");
  lines.push("**Redesign before expansion:**");
  for (const item of s.redesignBeforeExpansion) lines.push(`- ${item}`);
  lines.push("");

  lines.push("## 5. Category viability");
  lines.push("");
  lines.push("| Category | Products | Verified rate | Match qual | Scrape | Recommendation |");
  lines.push("|----------|--------:|-------------:|-----------|--------|----------------|");
  for (const cat of report.categories) {
    lines.push(
      `| ${cat.category} | ${cat.productCount} | ${(cat.verifiedRate * 100).toFixed(0)}% | ${cat.matchingQuality} | ${cat.scrapeQuality} | ${cat.recommendation} |`,
    );
  }
  lines.push("");

  lines.push("## 6. Exact matching audit");
  lines.push("");
  const e = report.exactMatching;
  lines.push(`- Products with UPC: ${e.productsWithUpc}`);
  lines.push(`- Products with GTIN: ${e.productsWithGtin}`);
  lines.push(`- Identifier rows: ${e.identifierRows}`);
  lines.push(`- Exact matches (≥0.92): ${e.quotesExactMatch}`);
  lines.push(`- Similar (0.7–0.92): ${e.quotesSimilarMatch}`);
  lines.push(`- Low confidence (<0.7): ${e.quotesLowConfidence}`);
  lines.push(`- Exact match rate: ${e.exactMatchRate != null ? fmtRate(e.exactMatchRate) : "—"}`);
  lines.push(`- Avg match confidence: ${e.avgMatchConfidence?.toFixed(2) ?? "—"}`);
  lines.push("");
  lines.push("### Architecture");
  for (const [k, v] of Object.entries(e.architecture)) {
    lines.push(`- **${k}:** ${v}`);
  }
  lines.push("");

  lines.push("## 7. Top 20 production-ready products");
  lines.push("");
  if (!report.top20.length) {
    lines.push("*No A/B-grade products meet demo-ready criteria yet.*");
  } else {
    lines.push("| Rank | Catalog ID | Grade | Score | Verified | Retailers | Issues |");
    lines.push("|-----:|------------|-------|------:|---------:|----------:|--------|");
    report.top20.forEach((p, i) => {
      lines.push(
        `| ${i + 1} | ${p.catalogId} | ${p.grade} | ${p.score} | ${p.verifiedCount} | ${p.retailerDiversity} | ${p.issues.join("; ") || "—"} |`,
      );
    });
  }
  lines.push("");

  lines.push("## 8. Worst 20 products");
  lines.push("");
  lines.push("| Rank | Catalog ID | Grade | Score | Verified | Issues |");
  lines.push("|-----:|------------|-------|------:|---------:|--------|");
  report.worst20.forEach((p, i) => {
    lines.push(
      `| ${i + 1} | ${p.catalogId} | ${p.grade} | ${p.score} | ${p.verifiedCount} | ${p.issues.join("; ") || "—"} |`,
    );
  });
  lines.push("");

  lines.push("## 9. Operational analytics (24h)");
  lines.push("");
  const le = report.learningEvents;
  lines.push(`- Searches: ${le.searches24h}`);
  lines.push(`- Clicks: ${le.clicks24h}`);
  lines.push(`- Search→click CTR: ${le.searches24h ? fmtRate(le.clicks24h / le.searches24h) : "—"}`);
  lines.push(`- Avg enrichment latency: ${le.enrichmentLatencyAvgMs != null ? `${Math.round(le.enrichmentLatencyAvgMs)}ms` : "—"}`);
  lines.push(`- Cache hit rate: ${le.cacheHitRate != null ? fmtRate(le.cacheHitRate) : "—"}`);
  lines.push("");

  lines.push("## 10. Scaling roadmap");
  lines.push("");
  const road = report.scalingRoadmap;
  lines.push(`**Target:** ${road.targetProducts} high-quality products`);
  lines.push("");
  lines.push(`- Prioritize categories: ${road.prioritizeCategories.join(", ")}`);
  lines.push(`- Prioritize retailers: ${road.prioritizeRetailers.join(", ")}`);
  lines.push(`- Avoid retailers: ${road.avoidRetailers.join(", ")}`);
  lines.push(`- API required: ${road.apiRequired.join("; ")}`);
  lines.push(`- Scrape acceptable: ${road.scrapeAcceptable.join("; ")}`);
  lines.push(`- Hybrid needed: ${road.hybridNeeded.join("; ")}`);
  lines.push(`- Human curation: ${road.humanCurationNeeded.join("; ")}`);
  lines.push("");
  for (const phase of road.phases) {
    lines.push(`### ${phase.phase}`);
    lines.push(`Goal: ${phase.goal}`);
    for (const a of phase.actions) lines.push(`- ${a}`);
    lines.push("");
  }

  lines.push("## 11. Indexing pipeline walkthrough");
  lines.push("");
  lines.push(report.indexingWalkthrough);
  lines.push("");

  return lines.join("\n");
}
