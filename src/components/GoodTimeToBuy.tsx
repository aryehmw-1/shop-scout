"use client";

import type { ProductOffer } from "@/lib/types";
import { TrendingDown } from "lucide-react";

interface GoodTimeToBuyProps {
  offer: ProductOffer;
  className?: string;
}

export function GoodTimeToBuy({ offer, className = "" }: GoodTimeToBuyProps) {
  const reason =
    offer.dealExplanation?.goodTimeReason ??
    (offer.isHistoricalLow ? "At the lowest verified price we've seen" : undefined);

  const show =
    offer.dealExplanation?.isGoodTimeToBuy ||
    offer.isHistoricalLow ||
    (offer.percentBelowMarket ?? 0) >= 8;

  if (!show || !reason) return null;

  return (
    <p
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 ${className}`}
    >
      <TrendingDown size={15} className="shrink-0" />
      Good time to buy — {reason}
    </p>
  );
}
