import { loadAnalyticsEvents } from "./events";
import { loadProductFeedback } from "../feedback/product-feedback";

export interface ComparisonLearningReport {
  evaluatedAt: string;
  winnerClicks: number;
  alternativeClicks: number;
  disagreementRate: number;
  topAlternativeRetailers: Array<{ retailer: string; clicks: number }>;
  feedbackDisagree: number;
  priceVsTrustProxy: { priceReasons: number; trustReasons: number };
  insights: string[];
}

/** When users prefer alternatives over the recommended winner. */
export function analyzeComparisonLearning(): ComparisonLearningReport {
  const events = loadAnalyticsEvents().events;
  const feedback = loadProductFeedback();

  let winnerClicks = 0;
  let alternativeClicks = 0;
  const altRetailers = new Map<string, number>();

  for (const e of events) {
    if (e.event !== "offer_click" || !e.retailer) continue;
    const isWinner = e.meta?.clickedWinner !== false;
    if (isWinner) {
      winnerClicks++;
    } else {
      alternativeClicks++;
      altRetailers.set(e.retailer, (altRetailers.get(e.retailer) ?? 0) + 1);
    }
  }

  const total = winnerClicks + alternativeClicks;
  const disagreementRate = total ? alternativeClicks / total : 0;

  const feedbackDisagree = feedback.entries.filter(
    (e) => e.useful === false || e.whyNot === "wrong_product",
  ).length;

  const priceReasons = feedback.entries.filter((e) => e.whyNot === "price").length;
  const trustReasons = feedback.entries.filter((e) => e.whyNot === "trust").length;

  const insights: string[] = [];
  if (disagreementRate > 0.35 && alternativeClicks >= 3) {
    insights.push(
      "Users often click a non-winner store — price, habit, or trust may outweigh the deterministic pick.",
    );
  }
  if (priceReasons > trustReasons && priceReasons >= 2) {
    insights.push("“Price” is the top why-not reason — emphasize savings more clearly in the default card.");
  } else if (trustReasons >= 2) {
    insights.push("“Trust” why-not reasons dominate — calm uncertainty and evidence may need to be stronger.");
  }
  const topAlt = [...altRetailers.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topAlt) {
    insights.push(`Most common alternative: ${topAlt[0]} (${topAlt[1]} clicks).`);
  }
  if (insights.length === 0) {
    insights.push("Insufficient click comparison data — track winner vs alternative clicks in beta.");
  }

  return {
    evaluatedAt: new Date().toISOString(),
    winnerClicks,
    alternativeClicks,
    disagreementRate: Math.round(disagreementRate * 1000) / 1000,
    topAlternativeRetailers: [...altRetailers.entries()]
      .map(([retailer, clicks]) => ({ retailer, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8),
    feedbackDisagree,
    priceVsTrustProxy: { priceReasons, trustReasons },
    insights,
  };
}
