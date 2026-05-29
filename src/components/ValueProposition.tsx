"use client";

import { ShieldCheck, LineChart, Sparkles } from "lucide-react";

/** Surfaces differentiation vs Honey / Google Shopping / CamelCamelCamel. */
export function ValueProposition({ compact }: { compact?: boolean }) {
  const items = [
    {
      icon: ShieldCheck,
      title: "Verified, not guessed",
      body: "Live scraped prices with trust scores — estimates are clearly labeled.",
    },
    {
      icon: Sparkles,
      title: "Explainable Best Deal",
      body: "See why we picked a winner: market comparison, retailer reliability, and savings.",
    },
    {
      icon: LineChart,
      title: "Historical context",
      body: "Price trends and good-time-to-buy signals — not just today's lowest tag.",
    },
  ];

  return (
    <section
      className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}
      aria-label="Why Shop Scout"
    >
      {items.map(({ icon: Icon, title, body }) => (
        <div
          key={title}
          className="rounded-xl border border-stone-200/80 bg-white p-3 shadow-sm"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <Icon size={16} className="shrink-0 text-sage-600" aria-hidden />
            <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
          </div>
          <p className="text-xs leading-relaxed text-stone-600">{body}</p>
        </div>
      ))}
    </section>
  );
}
