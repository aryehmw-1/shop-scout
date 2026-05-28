"use client";

import { useState } from "react";
import { ArrowRight, Home, Link2 } from "lucide-react";

type VibeId = "porch" | "kitchen" | "market" | "fireside" | "quilt";

interface HomyVibe {
  id: VibeId;
  name: string;
  mood: string;
  emoji: string;
  isCurrent?: boolean;
  bg: string;
  mesh: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  headline: string;
  headlineAccent: string;
  body: string;
  btnPrimary: string;
  btnSecondary: string;
  cardBg: string;
  cardBorder: string;
  cardHighlight: string;
  swatches: string[];
  fontClass: string;
}

const VIBES: HomyVibe[] = [
  {
    id: "porch",
    name: "Front porch",
    mood: "Friendly orange glow — live site today",
    emoji: "🏡",
    isCurrent: true,
    bg: "#faf6f0",
    mesh: "radial-gradient(ellipse 70% 50% at 80% 0%, rgba(251,146,60,.2), transparent), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(245,158,11,.15), transparent)",
    badgeBg: "rgba(255,251,247,.95)",
    badgeBorder: "#fed7aa",
    badgeText: "#9a3412",
    headline: "#292524",
    headlineAccent: "linear-gradient(135deg, #c2410c, #f59e0b, #f43f5e)",
    body: "#57534e",
    btnPrimary: "linear-gradient(90deg, #f97316, #f59e0b, #ea580c)",
    btnSecondary: "rgba(255,251,247,.95)",
    cardBg: "rgba(255,251,247,.9)",
    cardBorder: "rgba(254,215,170,.5)",
    cardHighlight: "#fff7ed",
    swatches: ["#faf6f0", "#ea580c", "#f59e0b", "#f43f5e", "#44403c"],
    fontClass: "font-display",
  },
  {
    id: "kitchen",
    name: "Kitchen table",
    mood: "Terracotta, oat & olive — Sunday dinner energy",
    emoji: "🍲",
    bg: "#f7f2ea",
    mesh: "radial-gradient(ellipse 60% 45% at 100% 0%, rgba(180,83,9,.12), transparent), radial-gradient(ellipse 55% 40% at 0% 100%, rgba(87,83,48,.1), transparent)",
    badgeBg: "#f5efe4",
    badgeBorder: "#d6cfc0",
    badgeText: "#6b5c45",
    headline: "#3d3428",
    headlineAccent: "linear-gradient(135deg, #b45309, #ca8a04, #65a30d)",
    body: "#6b5c4f",
    btnPrimary: "linear-gradient(90deg, #c2410c, #b45309)",
    btnSecondary: "#f5efe4",
    cardBg: "#fffcf7",
    cardBorder: "#e8dfd0",
    cardHighlight: "#fef3e8",
    swatches: ["#f7f2ea", "#b45309", "#ca8a04", "#65a30d", "#3d3428"],
    fontClass: "font-homy",
  },
  {
    id: "market",
    name: "Farmers market",
    mood: "Sage, butter & cream — fresh & local",
    emoji: "🧺",
    bg: "#f6f7f0",
    mesh: "radial-gradient(ellipse 65% 50% at 50% -10%, rgba(134,163,97,.18), transparent), radial-gradient(ellipse 45% 35% at 100% 80%, rgba(234,179,8,.1), transparent)",
    badgeBg: "#f0f4e8",
    badgeBorder: "#c5d4b4",
    badgeText: "#3f5c38",
    headline: "#2d3a28",
    headlineAccent: "linear-gradient(135deg, #4d7c0f, #65a30d, #ca8a04)",
    body: "#5c6b52",
    btnPrimary: "linear-gradient(90deg, #4d7c0f, #65a30d)",
    btnSecondary: "#f0f4e8",
    cardBg: "#fafcf6",
    cardBorder: "#d9e4cc",
    cardHighlight: "#eef4e6",
    swatches: ["#f6f7f0", "#4d7c0f", "#65a30d", "#eab308", "#2d3a28"],
    fontClass: "font-homy",
  },
  {
    id: "fireside",
    name: "Fireside",
    mood: "Cocoa, amber & candlelight — cozy evening",
    emoji: "🕯️",
    bg: "#f3ebe3",
    mesh: "radial-gradient(ellipse 70% 55% at 50% 100%, rgba(180,83,9,.2), transparent), radial-gradient(ellipse 40% 30% at 0% 0%, rgba(120,53,15,.08), transparent)",
    badgeBg: "#ebe0d4",
    badgeBorder: "#d4c4b0",
    badgeText: "#6b4f3a",
    headline: "#3c2f26",
    headlineAccent: "linear-gradient(135deg, #92400e, #d97706, #b45309)",
    body: "#6b5344",
    btnPrimary: "linear-gradient(90deg, #92400e, #b45309)",
    btnSecondary: "#ebe0d4",
    cardBg: "#faf5ef",
    cardBorder: "#dcc9b8",
    cardHighlight: "#f5e6d8",
    swatches: ["#f3ebe3", "#92400e", "#d97706", "#78350f", "#3c2f26"],
    fontClass: "font-homy",
  },
  {
    id: "quilt",
    name: "Quilt & cedar",
    mood: "Dusty rose, cedar & linen — soft & handmade",
    emoji: "🪡",
    bg: "#faf5f2",
    mesh: "radial-gradient(ellipse 60% 45% at 20% 0%, rgba(190,120,100,.12), transparent), radial-gradient(ellipse 50% 40% at 90% 90%, rgba(120,90,70,.1), transparent)",
    badgeBg: "#f5eeea",
    badgeBorder: "#e8d5cc",
    badgeText: "#7c5c52",
    headline: "#44312c",
    headlineAccent: "linear-gradient(135deg, #9f5750, #c4785a, #a16207)",
    body: "#6f5a52",
    btnPrimary: "linear-gradient(90deg, #9f5750, #c4785a)",
    btnSecondary: "#f5eeea",
    cardBg: "#fffbfa",
    cardBorder: "#ecd9d2",
    cardHighlight: "#fceee8",
    swatches: ["#faf5f2", "#9f5750", "#c4785a", "#a16207", "#44312c"],
    fontClass: "font-homy",
  },
];

function MiniPreview({ vibe }: { vibe: HomyVibe }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ background: vibe.bg, backgroundImage: vibe.mesh }}
    >
      {vibe.isCurrent && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800 shadow-sm">
          Live now
        </span>
      )}
      <div className="p-5 pb-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={{
            background: vibe.badgeBg,
            borderColor: vibe.badgeBorder,
            color: vibe.badgeText,
          }}
        >
          <span>{vibe.emoji}</span>
          Shop Scout
        </span>

        <h3
          className={`${vibe.fontClass} mt-4 text-lg font-bold leading-tight`}
          style={{ color: vibe.headline }}
        >
          Find the best price on{" "}
          <span
            style={{
              background: vibe.headlineAccent,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            anything
          </span>
        </h3>

        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: vibe.body }}>
          Groceries, clothes, home — near you & online.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm"
            style={{ background: vibe.btnPrimary }}
          >
            Compare <ArrowRight size={10} />
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold"
            style={{
              background: vibe.btnSecondary,
              borderColor: vibe.cardBorder,
              color: vibe.headline,
            }}
          >
            <Link2 size={10} /> Link
          </span>
        </div>

        <div
          className="mt-4 rounded-xl border p-2.5"
          style={{
            background: vibe.cardBg,
            borderColor: vibe.cardBorder,
          }}
        >
          <div
            className="flex items-center justify-between rounded-lg px-2 py-1.5"
            style={{ background: vibe.cardHighlight }}
          >
            <span className="text-[10px] font-semibold" style={{ color: vibe.headline }}>
              Target · Near you
            </span>
            <span className="text-[10px] font-bold" style={{ color: vibe.headline }}>
              $24.99
            </span>
          </div>
        </div>
      </div>

      <div
        className="flex gap-1.5 border-t px-5 py-3"
        style={{ borderColor: vibe.cardBorder, background: "rgba(255,255,255,.35)" }}
      >
        {vibe.swatches.map((c) => (
          <span
            key={c}
            className="h-5 w-5 rounded-full ring-1 ring-black/5"
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

export function HomyVibeShowcase() {
  const [selected, setSelected] = useState<VibeId>("porch");
  const active = VIBES.find((v) => v.id === selected) ?? VIBES[0];

  return (
    <section
      id="homy-vibes"
      className="homy-linen border-y border-orange-100/70 bg-cream-100/50 px-6 py-16 lg:px-12"
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-cream-50 px-4 py-1.5 text-sm font-medium text-sage-800">
            <Home size={14} />
            Homy look options
          </span>
          <h2 className="font-homy mt-4 text-3xl font-bold text-ink-900 md:text-4xl">
            Pick a vibe — same Shop Scout, different feel
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-ink-600">
            Five cozy directions. Name stays <strong>Shop Scout</strong>. Tell us
            which number you like and we&apos;ll apply it across the whole site.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {VIBES.map((vibe, i) => (
            <button
              key={vibe.id}
              type="button"
              onClick={() => setSelected(vibe.id)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                selected === vibe.id
                  ? "border-orange-400 bg-orange-500 text-white shadow-md shadow-orange-500/25"
                  : "border-orange-200/80 bg-white/80 text-ink-700 hover:border-orange-300 hover:bg-orange-50"
              }`}
            >
              {i + 1}. {vibe.emoji} {vibe.name}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border border-orange-200/60 bg-white/80 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Selected
              </p>
              <h3 className="font-homy mt-1 text-2xl font-bold text-ink-900">
                {active.emoji} {active.name}
              </h3>
              <p className="mt-2 text-ink-600">{active.mood}</p>

              <ul className="mt-5 space-y-2 text-sm text-ink-600">
                <li>
                  <strong className="text-ink-800">Background:</strong> warm cream
                  & soft texture
                </li>
                <li>
                  <strong className="text-ink-800">Buttons:</strong> rounded,
                  gradient, never harsh
                </li>
                <li>
                  <strong className="text-ink-800">Type:</strong>{" "}
                  {active.fontClass === "font-homy"
                    ? "Fraunces serif headlines — extra homy"
                    : "Outfit sans — clean & friendly"}
                </li>
                <li>
                  <strong className="text-ink-800">Cards:</strong> soft borders,
                  quilt-like panels
                </li>
              </ul>

              {active.isCurrent ? (
                <p className="mt-5 rounded-xl bg-orange-50 px-4 py-3 text-sm text-sage-800">
                  You&apos;re viewing this on the live homepage hero and buttons
                  right now.
                </p>
              ) : (
                <p className="mt-5 rounded-xl bg-amber-50/80 px-4 py-3 text-sm text-ink-700">
                  Reply with{' '}
                  <strong>
                    &quot;Use vibe {VIBES.findIndex((v) => v.id === active.id) + 1} —{' '}
                    {active.name}&quot;
                  </strong>{' '}
                  and we&apos;ll switch the full site.
                </p>
              )}
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <MiniPreview vibe={active} />
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {VIBES.map((vibe) => (
            <button
              key={vibe.id}
              type="button"
              onClick={() => setSelected(vibe.id)}
              className={`text-left transition ${
                selected === vibe.id ? "ring-2 ring-orange-400 ring-offset-2 rounded-2xl" : ""
              }`}
            >
              <MiniPreview vibe={vibe} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
