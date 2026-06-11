"use client";

import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";

interface TrustModalProps {
  onClose: () => void;
  estimated?: boolean;
}

/**
 * Blocking "why you can trust Homivion" overlay. Mirrors the LocationModal
 * pattern: a full-screen scrim the user must dismiss before interacting with
 * anything else. Opened from the "Why trust this" control on the verified
 * pricing note. Every claim here must stay literally true.
 */
export function TrustModal({ onClose, estimated }: TrustModalProps) {
  // Lock background scroll while the overlay is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto animate-fade-in rounded-3xl border border-stone-200 bg-white p-8 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trust-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-100 text-sage-700">
          <ShieldCheck size={28} />
        </div>

        <h2 id="trust-title" className="mt-5 text-center text-xl font-bold text-stone-900">
          Why trust Homivion?
        </h2>

        {estimated ? (
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            A few of these are modeled catalog prices rather than a live check, and
            we label them clearly as estimated so you&apos;re never misled. For
            everything else, Homivion only shows prices we&apos;ve actually
            confirmed against the retailer&apos;s own listing — never invented
            numbers. We also compare pack sizes fairly, so a multipack or variety
            box never looks cheaper than it really is. Always confirm the exact
            pack size on the retailer before you buy.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Homivion only shows prices we&apos;ve actually confirmed against the
            retailer&apos;s own listing — never guesses or invented numbers. We
            re-check pricing regularly and label how fresh each price is, so you
            always know when it was last verified. We also compare pack sizes
            fairly, so a multipack or variety box never looks cheaper than it
            really is. If we can&apos;t confirm a price, we simply don&apos;t show
            it.
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-6 w-full rounded-2xl bg-sage-600 py-3.5 font-semibold text-white transition hover:bg-sage-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
