"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import type { VerifiedInventoryHitMeta } from "@/lib/types";

interface VerifiedInventoryHitBannerProps {
  hit: VerifiedInventoryHitMeta;
}

export function VerifiedInventoryHitBanner({ hit }: VerifiedInventoryHitBannerProps) {
  if (!hit.matched) return null;

  const verifiedDate = hit.lastVerifiedAt ?
    new Date(hit.lastVerifiedAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  : "Recently";

  return (
    <div className="rounded-2xl border-2 border-emerald-400/70 bg-emerald-50/80 p-4 sm:p-5">
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <ShieldCheck size={22} className="text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800">
            <CheckCircle2 size={14} aria-hidden />
            Verified product match
          </p>
          <p className="mt-1 text-sm text-emerald-950">
            We found a verified listing with a recently checked live price.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emerald-900/90">
            <span className="rounded-full bg-white/80 px-2 py-0.5 ring-1 ring-emerald-200">
              Last verified {verifiedDate}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
