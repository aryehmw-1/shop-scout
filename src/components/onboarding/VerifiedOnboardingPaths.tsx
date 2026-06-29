"use client";

import Link from "next/link";
import { Link2, Search } from "lucide-react";

interface VerifiedOnboardingPathsProps {
  /** Called when user picks a search example (chat only) */
  onTrySearch?: (query: string) => void;
  compact?: boolean;
}

const PATHS = [
  {
    id: "search",
    href: "/chat",
    icon: Search,
    title: "Search for a product",
    desc: "Type what you're shopping for — we'll compare live prices across stores.",
    cta: "Start searching",
    tone: "border-sage-300 bg-sage-50/80 hover:border-sage-400",
    iconTone: "text-sage-700",
  },
  {
    id: "link",
    href: "/chat?hint=link",
    icon: Link2,
    title: "I have a product link",
    desc: "Paste a link from Amazon or another store to compare that exact item.",
    cta: "Paste product link",
    tone: "border-orange-200 bg-orange-50/60 hover:border-orange-300",
    iconTone: "text-orange-700",
  },
] as const;

export function VerifiedOnboardingPaths({
  onTrySearch,
  compact = false,
}: VerifiedOnboardingPathsProps) {
  return (
    <section
      className={`grid gap-3 sm:grid-cols-2 ${compact ? "" : "max-w-3xl"}`}
      aria-label="Get started"
    >
      {PATHS.map((path) => {
        const Icon = path.icon;
        const inner = (
          <>
            <div className={`mb-2 flex items-center gap-2 ${path.iconTone}`}>
              <Icon size={compact ? 18 : 22} aria-hidden />
              <h3 className="text-sm font-bold text-ink-900">{path.title}</h3>
            </div>
            <p className="text-xs leading-relaxed text-ink-600">{path.desc}</p>
            <span className="mt-3 inline-block text-xs font-semibold text-ink-800 underline underline-offset-2">
              {path.cta} →
            </span>
          </>
        );

        if (path.id === "search" && onTrySearch) {
          return (
            <Link
              key={path.id}
              href="/chat?q=whole%20milk"
              scroll={false}
              onClick={(event) => {
                event.preventDefault();
                onTrySearch("whole milk");
              }}
              className={`rounded-2xl border p-4 text-left transition ${path.tone}`}
            >
              {inner}
            </Link>
          );
        }

        return (
          <Link
            key={path.id}
            href={path.href}
            scroll={false}
            className={`rounded-2xl border p-4 transition ${path.tone}`}
          >
            {inner}
          </Link>
        );
      })}
    </section>
  );
}
