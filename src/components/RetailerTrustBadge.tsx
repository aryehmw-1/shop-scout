"use client";

import type { ProductOffer } from "@/lib/types";
import { Shield } from "lucide-react";

interface RetailerTrustBadgeProps {
  offer: ProductOffer;
  compact?: boolean;
}

export function RetailerTrustBadge({ offer, compact }: RetailerTrustBadgeProps) {
  const score = offer.retailerTrustScore;
  if (score == null || score < 0.6) return null;

  const label =
    score >= 0.8 ? "Highly trusted retailer"
    : score >= 0.7 ? "Trusted retailer"
    : "Verified retailer";

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-sage-700">
        <Shield size={10} />
        Trusted
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-semibold text-sage-800">
      <Shield size={11} />
      {label}
    </span>
  );
}
