"use client";

import type { RecommendationExplanation } from "@/lib/commerce-intelligence/explain";
import { TrustSummaryCard } from "./TrustSummaryCard";

/** Chat / results — calm trust summary; details on expand. */
export function CommerceInsightBanner({
  insight,
  className = "mb-4",
}: {
  insight: RecommendationExplanation;
  variant?: "full" | "compact";
  className?: string;
}) {
  return <TrustSummaryCard insight={insight} className={className} />;
}
