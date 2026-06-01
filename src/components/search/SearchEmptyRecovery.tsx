"use client";

import Link from "next/link";
import { Link2, Search, ShieldCheck } from "lucide-react";
import {
  inferQueryCategoryFamily,
  getVerifiedFirstCategories,
} from "@/lib/inventory/category-coverage";
import { VERIFIED_RECOVERY_SUGGESTIONS } from "@/lib/inventory/onboarding-examples";
import type { RetrievalTrustDiagnostic } from "@/lib/search/retrieval-trust-message";

interface SearchEmptyRecoveryProps {
  query?: string;
  trust: RetrievalTrustDiagnostic;
  onTrySearch?: (query: string) => void;
}

export function SearchEmptyRecovery({
  query,
  trust,
  onTrySearch,
}: SearchEmptyRecoveryProps) {
  const family = inferQueryCategoryFamily(query);
  const verifiedCategories = getVerifiedFirstCategories().filter(
    (c) => c.tier === "production" || c.tier === "indexed",
  );

  return (
    <div className="mt-4 space-y-5 text-left">
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center">
        <p className="font-medium text-stone-800">{trust.headline}</p>
        <p className="mt-2 text-sm text-stone-600">{trust.detail}</p>
        {trust.hints.length > 0 && (
          <ul className="mx-auto mt-3 max-w-md text-left text-sm text-stone-600">
            {trust.hints.map((h) => (
              <li key={h} className="mt-1 list-disc ml-5">
                {h}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-orange-950">
          <Link2 size={16} aria-hidden />
          Have a product page open?
        </p>
        <p className="mt-1 text-sm text-orange-900/80">
          Paste a direct Amazon or retailer URL — this works best for apparel and
          blocked categories where live search coverage is limited.
        </p>
        <Link
          href="/chat?hint=link"
          className="mt-3 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-orange-900 shadow-sm ring-1 ring-orange-200 hover:bg-orange-50"
        >
          Paste a product link
        </Link>
      </div>

      {family === "apparel" && (
        <div>
          <p className="text-sm font-semibold text-stone-800">
            Categories with verified coverage today
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {verifiedCategories.map((cat) =>
              onTrySearch ? (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onTrySearch(cat.query)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-white px-3 py-1.5 text-sm font-medium text-sage-800 hover:border-sage-400 hover:bg-sage-50"
                >
                  <span>{cat.emoji}</span>
                  {cat.label}
                </button>
              ) : (
                <Link
                  key={cat.id}
                  href={`/chat?start=${cat.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-white px-3 py-1.5 text-sm font-medium text-sage-800 hover:border-sage-400 hover:bg-sage-50"
                >
                  <span>{cat.emoji}</span>
                  {cat.label}
                </Link>
              ),
            )}
          </div>
        </div>
      )}

      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Search size={16} aria-hidden />
          Try a verified grocery search
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VERIFIED_RECOVERY_SUGGESTIONS.map((s) =>
            onTrySearch ? (
              <button
                key={s.query}
                type="button"
                onClick={() => onTrySearch(s.query)}
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-sage-300 hover:bg-sage-50"
              >
                {s.label}
              </button>
            ) : (
              <Link
                key={s.query}
                href={`/chat?q=${encodeURIComponent(s.query)}`}
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-sage-300 hover:bg-sage-50"
              >
                {s.label}
              </Link>
            ),
          )}
        </div>
      </div>

      <Link
        href="/verified"
        className="flex items-center justify-center gap-2 rounded-xl border border-sage-300 bg-sage-50 px-4 py-3 text-sm font-semibold text-sage-900 hover:bg-sage-100"
      >
        <ShieldCheck size={16} aria-hidden />
        Browse all verified inventory
      </Link>
    </div>
  );
}
