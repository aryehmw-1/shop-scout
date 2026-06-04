import type { DecisionSnapshot } from "@/lib/commerce-intelligence/drift/snapshots";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { formatPrice } from "@/lib/utils/format";
import { History } from "lucide-react";

/** Calm recommendation context — recent winner changes only. */
export function RecommendationHistoryPanel({
  snapshots,
  className = "",
}: {
  snapshots: DecisionSnapshot[];
  className?: string;
}) {
  const recent = snapshots.slice(0, 6);
  if (recent.length < 2) return null;

  return (
    <section
      className={`rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4 ${className}`}
      aria-labelledby="rec-history-title"
    >
      <div className="flex items-center gap-2">
        <History size={18} className="text-stone-500" aria-hidden />
        <h2 id="rec-history-title" className="text-sm font-semibold text-stone-800">
          Recent recommendation context
        </h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-stone-600">
        How our best pick has shifted over time — prices and stores can change.
      </p>
      <ul className="mt-3 space-y-2">
        {recent.map((s) => {
          const name = getRetailerMeta(s.winnerRetailer).name;
          return (
            <li
              key={s.at}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-stone-800">{name}</span>
              <span className="text-stone-600">{formatPrice(s.winnerPrice)}</span>
              <time className="w-full text-xs text-stone-400" dateTime={s.at}>
                {new Date(s.at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
