"use client";

import { ShieldCheck, Package } from "lucide-react";
import {
  shouldShowRichVerifiedCompare,
} from "@/lib/inventory/category-trust-score";
import { getCategoryCoverageProfile } from "@/lib/inventory/category-coverage";

interface VerifiedCompareHeaderProps {
  categoryId?: string;
  offerCount: number;
  zipCode?: string;
}

export function VerifiedCompareHeader({
  categoryId,
  offerCount,
  zipCode,
}: VerifiedCompareHeaderProps) {
  const rich = shouldShowRichVerifiedCompare(categoryId);
  const profile = categoryId ? getCategoryCoverageProfile(categoryId) : null;

  if (!rich || !profile) return null;

  return (
    <div className="mb-4 rounded-xl border border-sage-300/80 bg-white/80 p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sage-100">
          <ShieldCheck size={20} className="text-sage-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-sage-700">
            Verified pricing
          </p>
          <p className="mt-0.5 text-sm font-semibold text-stone-900">
            Live retailer prices you can trust
          </p>
          <p className="mt-1 text-xs text-stone-600">
            We compare pack sizes fairly so you&apos;re not misled by multipacks or variety boxes.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-600">
        <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 px-2 py-0.5 ring-1 ring-sage-200">
          <Package size={12} aria-hidden />
          Pack size shown on each offer
        </span>
        {zipCode && (
          <span className="rounded-full bg-stone-100 px-2 py-0.5">
            Ships to {zipCode}
          </span>
        )}
      </div>
    </div>
  );
}
