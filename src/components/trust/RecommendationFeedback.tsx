"use client";

import { getBetaCohort } from "@/lib/commerce-intelligence/beta/cohort-client";
import { trackIntelligenceEvent } from "@/lib/commerce-intelligence/analytics/track-client";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

type Phase = "idle" | "useful_no" | "useful_yes_followup" | "done";

export function RecommendationFeedback({
  canonicalId,
  sessionId,
}: {
  canonicalId: string;
  sessionId?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [submitting, setSubmitting] = useState(false);

  async function send(payload: {
    useful?: boolean;
    bought?: boolean;
    explanationHelpful?: boolean;
    whyNot?: string;
  }) {
    setSubmitting(true);
    try {
      await fetch("/api/intelligence/v1/product-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalId,
          sessionId,
          cohort: getBetaCohort(),
          ...payload,
        }),
        keepalive: true,
      });
    } catch {
      /* best effort */
    } finally {
      setSubmitting(false);
    }
  }

  async function markUseful(useful: boolean) {
    if (useful) {
      setPhase("useful_yes_followup");
      return;
    }
    setPhase("useful_no");
    trackIntelligenceEvent("recommendation_ignore", { canonicalId });
  }

  async function finishPositive(explanationHelpful?: boolean) {
    await send({ useful: true, explanationHelpful });
    setPhase("done");
  }

  if (phase === "done") {
    return (
      <p className="text-xs text-stone-500">Thanks — this helps us improve picks for everyone.</p>
    );
  }

  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <p className="text-xs font-medium text-stone-600">Was this recommendation useful?</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void markUseful(true)}
          className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
        >
          <ThumbsUp size={16} aria-hidden />
          Yes
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void markUseful(false)}
          className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
        >
          <ThumbsDown size={16} aria-hidden />
          No
        </button>
      </div>

      {phase === "useful_yes_followup" && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-stone-500">Was the explanation clear? (optional)</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void finishPositive(true)}
              className="rounded-full border border-sage-200 bg-sage-50 px-3 py-1 text-xs font-medium text-sage-800"
            >
              Yes, clear
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void finishPositive(false)}
              className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600"
            >
              Could be clearer
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void finishPositive()}
              className="text-xs text-stone-500 underline"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {phase === "useful_no" && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-stone-500">Quick follow-up (optional):</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["price", "Price"],
                ["wrong_product", "Wrong item"],
                ["trust", "Not sure I trust it"],
                ["other", "Other"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                disabled={submitting}
                onClick={() => {
                  void send({ useful: false, whyNot: key });
                  setPhase("done");
                }}
                className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 active:bg-stone-50"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              void send({ useful: false, bought: true });
              setPhase("done");
            }}
            className="text-xs font-medium text-sage-700 underline"
          >
            I bought it anyway
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              void send({ useful: false, explanationHelpful: false });
              setPhase("done");
            }}
            className="ml-3 text-xs text-stone-500 underline"
          >
            Explanation wasn’t helpful
          </button>
        </div>
      )}
    </div>
  );
}
