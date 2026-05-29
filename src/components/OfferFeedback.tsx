"use client";

import { useState } from "react";
import type { ProductOffer } from "@/lib/types";
import { trackEvent } from "@/lib/analytics/track-client";
import { ThumbsDown, ThumbsUp, X } from "lucide-react";

type FeedbackReason =
  | "wrong_product"
  | "price_outdated"
  | "bad_retailer_match"
  | "other";

interface OfferFeedbackProps {
  offer: ProductOffer;
  catalogId?: string;
  className?: string;
}

export function OfferFeedback({ offer, catalogId, className }: OfferFeedbackProps) {
  const [submitted, setSubmitted] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(
    rating: "accurate" | "inaccurate",
    reason?: FeedbackReason,
  ) {
    if (pending || submitted) return;
    setPending(true);

    trackEvent({
      name: "feedback_submitted",
      properties: {
        offerId: offer.id,
        retailer: offer.retailer,
        catalogId: catalogId ?? offer.catalogId,
        rating,
        reason,
      },
    });

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offer.id,
          retailer: offer.retailer,
          catalogId: catalogId ?? offer.catalogId,
          rating,
          reason,
        }),
      });
    } catch {
      /* non-blocking */
    }

    setSubmitted(true);
    setShowReasons(false);
    setPending(false);
  }

  if (submitted) {
    return (
      <p className={`text-xs text-stone-500 ${className ?? ""}`} role="status">
        Thanks — your feedback helps improve results.
      </p>
    );
  }

  if (showReasons) {
    const reasons: { id: FeedbackReason; label: string }[] = [
      { id: "wrong_product", label: "Wrong product" },
      { id: "price_outdated", label: "Price outdated" },
      { id: "bad_retailer_match", label: "Bad retailer match" },
      { id: "other", label: "Something else" },
    ];

    return (
      <div
        className={`rounded-xl border border-stone-200 bg-stone-50 p-3 ${className ?? ""}`}
        role="group"
        aria-label="Tell us what went wrong"
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-stone-700">What was wrong?</p>
          <button
            type="button"
            onClick={() => setShowReasons(false)}
            className="rounded p-1 text-stone-400 hover:bg-stone-200"
            aria-label="Close feedback"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={pending}
              onClick={() => submit("inaccurate", r.id)}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:border-sage-400 hover:text-sage-800"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 ${className ?? ""}`}
      role="group"
      aria-label="Was this deal accurate?"
    >
      <span className="text-xs text-stone-500">Accurate?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => submit("accurate")}
        className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
        aria-label="Yes, accurate"
      >
        <ThumbsUp size={14} />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setShowReasons(true)}
        className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
        aria-label="No, not accurate"
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  );
}
