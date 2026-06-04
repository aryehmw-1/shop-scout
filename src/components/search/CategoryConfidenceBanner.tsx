"use client";

import Link from "next/link";
import { ShieldCheck, FlaskConical, Info } from "lucide-react";
import { getCategoryConfidenceMessage } from "@/lib/inventory/category-messaging";

interface CategoryConfidenceBannerProps {
  query?: string;
  compact?: boolean;
}

export function CategoryConfidenceBanner({
  query,
  compact = false,
}: CategoryConfidenceBannerProps) {
  const msg = getCategoryConfidenceMessage(query);
  if (!query?.trim() && !msg.showExperimentalBanner && !msg.emphasizeVerifiedInventory) {
    return null;
  }

  const Icon = msg.emphasizeVerifiedInventory ? ShieldCheck : msg.showExperimentalBanner ? FlaskConical : Info;
  const tone = msg.emphasizeVerifiedInventory
    ? "border-sage-300 bg-sage-50/80 text-sage-900"
    : msg.showExperimentalBanner
      ? "border-amber-300 bg-amber-50/70 text-amber-950"
      : "border-stone-200 bg-stone-50 text-stone-800";

  if (compact) {
    return (
      <div className={`rounded-xl border px-3 py-2 text-xs ${tone}`}>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Icon size={14} aria-hidden />
          {msg.badge}
        </span>
        <span className="ml-2 text-inherit/80">{msg.headline}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${tone}`}>
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
          <Icon size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{msg.badge}</p>
          <h4 className="mt-0.5 text-base font-bold">{msg.headline}</h4>
          <p className="mt-1 text-sm leading-relaxed opacity-90">{msg.detail}</p>
          {msg.tips.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm opacity-90">
              {msg.tips.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="opacity-50">·</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
          {msg.emphasizeVerifiedInventory && (
            <Link
              href="/inventory"
              className="mt-3 inline-flex text-sm font-semibold underline underline-offset-2 hover:opacity-80"
            >
              See popular products →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
