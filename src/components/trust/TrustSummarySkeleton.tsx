"use client";

/** Perceived-speed placeholder while intelligence loads. */
export function TrustSummarySkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-sage-100 bg-white px-4 py-4 ${className}`}
      aria-hidden
    >
      <div className="flex gap-3">
        <div className="h-6 w-6 shrink-0 rounded-full bg-stone-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-stone-200" />
          <div className="h-3 w-full rounded bg-stone-100" />
          <div className="h-3 w-5/6 rounded bg-stone-100" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-11 flex-1 rounded-xl bg-stone-100" />
        <div className="h-11 flex-1 rounded-xl bg-stone-100" />
      </div>
      <p className="mt-2 text-center text-xs text-stone-400">Finding the best verified match…</p>
    </div>
  );
}
