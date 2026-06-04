"use client";

import { ShieldCheck, Tag, Sparkles } from "lucide-react";

/** Consumer-facing value props — no backend jargon. */
export function ValueProposition({ compact }: { compact?: boolean }) {
  const items = [
    {
      icon: ShieldCheck,
      title: "Verified live prices",
      body: "We show real retailer prices — not guesses — and label estimates clearly.",
    },
    {
      icon: Tag,
      title: "Fair pack-size comparison",
      body: "Multipacks and variety boxes won't masquerade as single-item matches.",
    },
    {
      icon: Sparkles,
      title: "Shop your way",
      body: "Search by name or paste a product link — compare before you buy.",
    },
  ];

  return (
    <section
      className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}
      aria-label="Why Homivion"
    >
      {items.map(({ icon: Icon, title, body }) => (
        <div
          key={title}
          className="rounded-xl border border-sage-200/80 bg-white p-3 shadow-sm"
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
