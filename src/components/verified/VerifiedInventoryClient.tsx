"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ExternalLink, CheckCircle2, Clock } from "lucide-react";
import type { VerifiedBrowseResult } from "@/lib/inventory/verified-inventory-browse";
import { affiliateSafeDestination } from "@/lib/affiliate/outbound";
import type { RetailerId } from "@/lib/types";
import { formatPrice } from "@/lib/utils/format";
import { ProductImage } from "@/components/ProductImage";
import { getCategoryCoverageProfile } from "@/lib/inventory/category-coverage";

type Mode = VerifiedBrowseResult["mode"];

interface VerifiedInventoryClientProps {
  initial: VerifiedBrowseResult;
}

const MODES: { id: Mode; label: string; desc: string }[] = [
  {
    id: "all",
    label: "All persisted pricing",
    desc: "Active persisted quotes from nightly indexing",
  },
  {
    id: "qa_approved",
    label: "QA approved",
    desc: "Manually reviewed and approved by our team",
  },
  {
    id: "persisted",
    label: "Persisted pricing",
    desc: "Same persisted pricing rows — transparency view",
  },
];

export function VerifiedInventoryClient({ initial }: VerifiedInventoryClientProps) {
  const [data, setData] = useState(initial);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [loading, setLoading] = useState(false);

  async function switchMode(next: Mode) {
    if (next === mode) return;
    setLoading(true);
    setMode(next);
    try {
      const res = await fetch(`/api/verified-inventory?mode=${next}`);
      if (res.ok) {
        const json = (await res.json()) as VerifiedBrowseResult;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-sage-300 bg-sage-50/60 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-sage-700" size={24} />
          <div>
            <h2 className="text-lg font-bold text-sage-950">Persisted pricing</h2>
            <p className="mt-1 text-sm leading-relaxed text-sage-900/85">
              Products with persisted pricing indexed nightly with pack
              normalization. Start here for the most reliable compare pricing in inventory.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={loading}
            onClick={() => switchMode(m.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === m.id
                ? "bg-sage-700 text-white shadow-md"
                : "border border-stone-200 bg-white text-stone-700 hover:border-sage-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-stone-600">
        {MODES.find((m) => m.id === mode)?.desc} ·{" "}
        <strong>{data.totalProducts}</strong> products ·{" "}
        <strong>{data.totalQuotes}</strong> persisted price quotes
        {data.qaApprovedCount > 0 && (
          <> · <strong>{data.qaApprovedCount}</strong> QA approved</>
        )}
      </p>

      {loading && (
        <p className="text-sm text-stone-500">Loading inventory…</p>
      )}

      {!loading && data.products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
          <p className="font-medium text-stone-800">No products in this view yet</p>
          <p className="mt-2 text-sm text-stone-600">
            {mode === "qa_approved"
              ? "QA-approved products will appear here after manual review at /admin/qa."
              : "Run nightly indexing to populate persisted pricing."}
          </p>
          <Link
            href="/chat"
            className="mt-4 inline-flex rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800"
          >
            Compare grocery pricing instead
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.products.map((p) => {
          const coverage = getCategoryCoverageProfile(p.category);
          return (
            <article
              key={p.catalogId}
              className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
            >
              <div className="relative aspect-square bg-stone-50">
                <ProductImage
                  src={p.imageUrl}
                  alt={p.title}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 rounded-full bg-sage-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  {coverage.badge}
                </span>
                {p.qaApproved && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    <CheckCircle2 size={10} />
                    QA
                  </span>
                )}
                {p.qaPending && !p.qaApproved && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    <Clock size={10} />
                    Review
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
                  {coverage.label}
                </p>
                <h3 className="mt-0.5 font-semibold leading-snug text-stone-900">
                  {p.brand} {p.title}
                </h3>
                <p className="text-xs text-stone-500">{p.size}</p>
                <p className="mt-2 text-lg font-bold text-sage-800">
                  {p.minPrice === p.maxPrice
                    ? formatPrice(p.minPrice)
                    : `${formatPrice(p.minPrice)} – ${formatPrice(p.maxPrice)}`}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {p.quoteCount} verified quote{p.quoteCount === 1 ? "" : "s"} ·{" "}
                  {p.retailers.join(", ")}
                </p>
                <div className="mt-auto flex gap-2 pt-4">
                  <Link
                    href={`/chat?q=${encodeURIComponent(`${p.brand} ${p.title}`)}`}
                    className="flex-1 rounded-xl bg-sage-700 py-2 text-center text-sm font-semibold text-white hover:bg-sage-800"
                  >
                    Compare
                  </Link>
                  {(() => {
                    // Affiliate-safe: Amazon/eBay links without attachable
                    // tracking are hidden rather than shown raw.
                    const dest = affiliateSafeDestination(
                      p.bestQuote.retailerId as RetailerId,
                      p.bestQuote.productUrl,
                    );
                    if (!dest) return null;
                    return (
                      <a
                        href={dest}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="inline-flex items-center justify-center rounded-xl border border-stone-200 px-3 py-2 text-stone-600 hover:bg-stone-50"
                        aria-label="View on retailer"
                      >
                        <ExternalLink size={16} />
                      </a>
                    );
                  })()}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
