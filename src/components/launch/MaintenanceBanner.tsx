"use client";

import { publicLaunchFlags } from "@/lib/commerce-intelligence/ops/public-flags";

export function MaintenanceBanner() {
  const msg = publicLaunchFlags.maintenanceBanner;
  if (!msg) return null;

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
      role="status"
    >
      {msg}
    </div>
  );
}
