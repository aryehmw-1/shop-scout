"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  // Render into a portal so the overlay sits at the top of the DOM, above the
  // chat input bar and everything else, regardless of where it's mounted in the
  // tree. Without this, the modal's z-index is trapped in a nested stacking
  // context and the user could still tap/type in the input bar behind it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock background scroll while the overlay is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const points = estimated
    ? [
        "A few of these are modeled catalog prices, not a live check — and we label those clearly as estimated.",
        "Every other price is one we've actually confirmed on the retailer's own listing — never invented.",
        "We compare pack sizes fairly, so a multipack or variety box never looks cheaper than it really is.",
        "Always confirm the exact pack size on the retailer before you buy.",
      ]
    : [
        "We only show prices we've actually confirmed on the retailer's own listing — never guesses.",
        "We re-check pricing regularly and label how fresh each price is, so you know when it was last verified.",
        "We compare pack sizes fairly, so a multipack or variety box never looks cheaper than it really is.",
        "If we can't confirm a price, we simply don't show it.",
      ];

  if (!mounted) return null;

  return createPortal(
    // Full-screen, transparent layer that still captures every tap, so the rest
    // of the site is unusable until the user taps "Got it". No dark scrim.
    // touch-action:none stops the browser from treating taps on this layer as
    // double-tap-to-zoom gestures while the modal is open.
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ touchAction: "none" }}
      onClick={(e) => {
        // Absorb taps outside the card — nothing behind the modal is usable.
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto animate-fade-in rounded-3xl border border-stone-200 bg-white p-7 shadow-2xl ring-1 ring-stone-900/5"
        style={{ touchAction: "pan-y" }}
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

        <ul className="mt-4 space-y-2.5">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm leading-snug text-stone-600">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-sage-500" aria-hidden />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-6 w-full rounded-2xl bg-sage-600 py-3.5 font-semibold text-white transition hover:bg-sage-700"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
