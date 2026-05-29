import { prisma } from "../db/prisma";

export type AlertSeverity = "info" | "warning" | "critical";

export interface QualityAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  metric?: string;
  value?: number;
}

const FETCH_WARN = 0.5;
const PARSER_WARN = 0.5;
const TRUST_WARN = 0.45;
const STALE_HOURS = 48;
const ANOMALY_PCT = 55;

export async function runQualityChecks(): Promise<QualityAlert[]> {
  const alerts: QualityAlert[] = [];
  const now = new Date();

  const metrics = await prisma.retailerQualityMetric.findMany();
  for (const m of metrics) {
    const fetchRate =
      m.fetchAttempts > 0 ? m.fetchSuccesses / m.fetchAttempts : 1;
    const parserRate =
      m.parserAttempts > 0 ? m.parserSuccesses / m.parserAttempts : 1;

    if (m.fetchAttempts >= 5 && fetchRate < FETCH_WARN) {
      alerts.push({
        id: `fetch-${m.retailerId}`,
        severity: fetchRate < 0.25 ? "critical" : "warning",
        title: `${m.retailerId} fetch degradation`,
        detail: `Fetch success ${Math.round(fetchRate * 100)}% over ${m.fetchAttempts} attempts`,
        metric: "fetch_success_rate",
        value: fetchRate,
      });
    }

    if (m.parserAttempts >= 5 && parserRate < PARSER_WARN) {
      alerts.push({
        id: `parser-${m.retailerId}`,
        severity: parserRate < 0.25 ? "critical" : "warning",
        title: `${m.retailerId} parser degradation`,
        detail: `Parser success ${Math.round(parserRate * 100)}% over ${m.parserAttempts} attempts`,
        metric: "parser_success_rate",
        value: parserRate,
      });
    }

    if (m.trustScore < TRUST_WARN) {
      alerts.push({
        id: `trust-${m.retailerId}`,
        severity: "warning",
        title: `${m.retailerId} low trust score`,
        detail: `Trust score ${m.trustScore.toFixed(2)} — review match quality`,
        metric: "trust_score",
        value: m.trustScore,
      });
    }
  }

  const staleCutoff = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);
  const staleCount = await prisma.priceQuote.count({
    where: {
      source: { in: ["scraped", "connector_api"] },
      fetchedAt: { lt: staleCutoff },
    },
  });
  if (staleCount > 20) {
    alerts.push({
      id: "stale-offers",
      severity: "warning",
      title: "Stale verified offers",
      detail: `${staleCount} scraped quotes older than ${STALE_HOURS}h still active`,
      metric: "stale_offer_count",
      value: staleCount,
    });
  }

  const stats = await prisma.productRetailerPriceStats.findMany({
    take: 200,
    orderBy: { updatedAt: "desc" },
  });
  for (const s of stats) {
    const baseline = s.movingAvgPriceUsd ?? s.lowestPriceUsd;
    const last = s.lastVerifiedPriceUsd;
    if (!baseline || !last || baseline <= 0 || last <= 0) continue;
    const deltaPct = Math.abs((last - baseline) / baseline) * 100;
    if (deltaPct >= ANOMALY_PCT) {
      alerts.push({
        id: `anomaly-${s.productId}-${s.retailerId}`,
        severity: "warning",
        title: `Price anomaly: ${s.retailerId}`,
        detail: `Last $${last.toFixed(2)} vs avg $${baseline.toFixed(2)} (${Math.round(deltaPct)}% off)`,
        metric: "price_anomaly_pct",
        value: deltaPct,
      });
    }
  }

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [searches, clicks] = await Promise.all([
    prisma.learningEvent.count({
      where: { kind: "search_performed", createdAt: { gte: since } },
    }),
    prisma.learningEvent.count({
      where: { kind: { in: ["offer_click", "best_deal_click"] }, createdAt: { gte: since } },
    }),
  ]);

  if (searches >= 20) {
    const ctr = clicks / searches;
    if (ctr < 0.08) {
      alerts.push({
        id: "ctr-drop",
        severity: "warning",
        title: "Low search-to-click conversion",
        detail: `${clicks} clicks / ${searches} searches (${Math.round(ctr * 100)}% CTR) in 24h`,
        metric: "search_click_ctr",
        value: ctr,
      });
    }
  }

  const enrichFails = await prisma.learningEvent.count({
    where: {
      kind: "enrichment_completed",
      createdAt: { gte: since },
      payloadJson: { contains: '"success":false' },
    },
  });
  if (enrichFails >= 5) {
    alerts.push({
      id: "enrichment-failures",
      severity: "warning",
      title: "Enrichment failures spiking",
      detail: `${enrichFails} failed enrichments in 24h`,
      metric: "enrichment_failures",
      value: enrichFails,
    });
  }

  const feedbackNegative = await prisma.learningEvent.count({
    where: {
      kind: "feedback_submitted",
      createdAt: { gte: since },
      payloadJson: { contains: '"rating":"inaccurate"' },
    },
  });
  if (feedbackNegative >= 10) {
    alerts.push({
      id: "feedback-negative-spike",
      severity: "warning",
      title: "Negative accuracy feedback spiking",
      detail: `${feedbackNegative} inaccurate reports in 24h — review match quality`,
      metric: "negative_feedback_count",
      value: feedbackNegative,
    });
  }

  return alerts.sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}
