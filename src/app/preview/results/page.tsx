"use client";

import { useState } from "react";
import {
  ExternalLink,
  TrendingDown,
  BadgeCheck,
  Truck,
  ChevronRight,
  Crown,
  ArrowRight,
  Zap,
  Tag,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * LOCAL PREVIEW ONLY — not linked anywhere, not deployed intent.
 * Visit http://localhost:3000/preview/results to compare 3 layouts
 * for how products render under the AI's text answer (each with a
 * little photo). Uses mock data + real photos so you can judge look.
 * ------------------------------------------------------------------ */

interface MockOffer {
  id: string;
  store: string;
  title: string;
  price: number;
  delivered: number;
  img: string;
  verifiedLabel: string;
  /** Real signal we actually compute — % below market median. */
  pctBelow?: number;
  /** Shipping: exactly one of these reflects what we actually know. */
  freeShipping?: boolean;
  shipping?: number;
  shippingEstimated?: boolean;
  /** True when we genuinely can't know shipping up front (e.g. Amazon). */
  shippingAtCheckout?: boolean;
}

const OFFERS: MockOffer[] = [
  {
    id: "1",
    store: "Walmart",
    title: "Honey Nut Cheerios, 27.2 oz",
    price: 4.98,
    delivered: 4.98,
    img: "https://images.unsplash.com/photo-1614961233913-a5113a4a34ed?w=200&q=80",
    verifiedLabel: "Verified 2h ago",
    pctBelow: 18,
    freeShipping: true,
  },
  {
    id: "2",
    store: "Amazon",
    title: "Honey Nut Cheerios, 18.8 oz",
    price: 5.79,
    delivered: 5.79,
    img: "https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?w=200&q=80",
    verifiedLabel: "Live price",
    pctBelow: 5,
    shippingAtCheckout: true,
  },
  {
    id: "3",
    store: "Target",
    title: "Honey Nut Cheerios Cereal, 27.2 oz",
    price: 5.99,
    delivered: 7.49,
    img: "https://images.unsplash.com/photo-1521483451569-e33803c0330c?w=200&q=80",
    verifiedLabel: "Verified 1d ago",
    shipping: 1.5,
    shippingEstimated: true,
  },
];

/** Single shipping statement — never doubles up with a "delivered" figure. */
function shippingInfo(o: MockOffer): { text: string; free: boolean } {
  if (o.freeShipping) return { text: "Free shipping", free: true };
  if (o.shippingAtCheckout) return { text: "Shipping at checkout", free: false };
  if (o.shipping != null)
    return {
      text: `+${money(o.shipping)}${o.shippingEstimated ? " est." : ""} shipping`,
      free: false,
    };
  return { text: "", free: false };
}

const money = (n: number) => `$${n.toFixed(2)}`;
const highest = Math.max(...OFFERS.map((o) => o.delivered));

function AiAnswer() {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white">
        H
      </div>
      <div className="min-w-0 flex-1 text-[15px] leading-relaxed text-stone-800">
        <p>
          Here&apos;s what I found for <strong>Honey Nut Cheerios</strong> — shipping to your ZIP.
          The best value is <strong>Walmart at $4.98</strong>.
        </p>
      </div>
    </div>
  );
}

/* ============================== VARIANT A ============================== *
 * "Clean rows" — calm, scannable list. Photo, store+name, price+View.
 * Best deal gets a green accent rail + badge. Minimal, premium, trustworthy.
 * ==================================================================== */
function VariantA() {
  return (
    <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {OFFERS.map((o, i) => {
        const best = i === 0;
        return (
          <li
            key={o.id}
            className={`flex items-center gap-4 border-b border-stone-100 px-4 py-3.5 last:border-0 ${
              best ? "bg-emerald-50/40" : ""
            }`}
          >
            <div className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-50 ring-1 ${best ? "ring-emerald-200" : "ring-stone-100"}`}>
              <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-stone-900">{o.store}</span>
                {best && (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Best price
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-stone-500">{o.title}</p>
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-stone-400">
                <BadgeCheck size={12} className="text-emerald-500" /> {o.verifiedLabel}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-lg font-extrabold leading-none text-stone-900">{money(o.price)}</span>
              {o.delivered > o.price + 0.01 && (
                <span className="mt-0.5 text-[11px] text-stone-400">{money(o.delivered)} delivered</span>
              )}
              <a
                href="#"
                className={`mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
                  best ? "bg-emerald-600 hover:bg-emerald-700" : "bg-stone-800 hover:bg-stone-900"
                }`}
              >
                View <ExternalLink size={12} />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ============================== VARIANT B ============================== *
 * "Hero cards" — bolder, more retail/marketing energy. Each offer is its
 * own card with a big photo, store chip, rating, big price, savings pill,
 * and a full-width gradient View button. Best deal floats with a ribbon.
 * ==================================================================== */
function VariantB() {
  return <VariantBCompact />;
}

/* Compact (phone) Option B — dense so more fits on a phone screen. */
function VariantBCompact() {
  return (
    <div className="space-y-2">
      {OFFERS.map((o, i) => {
        const best = i === 0;
        const save = highest - o.delivered;
        const ship = shippingInfo(o);
        return (
          <div
            key={o.id}
            className={`relative flex gap-2.5 rounded-xl border bg-white p-2 shadow-sm transition hover:shadow-md ${
              best ? "border-orange-300 ring-1 ring-orange-200/70" : "border-stone-200"
            }`}
          >
            <div className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-lg bg-stone-50 ring-1 ring-stone-100">
              <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
              {best && (
                <span className="absolute left-0 top-0 inline-flex items-center gap-0.5 rounded-br-lg bg-gradient-to-r from-orange-500 to-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  <Crown size={9} /> Best
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Row 1: store + verified */}
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold text-stone-700">
                  {o.store}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                  <BadgeCheck size={11} className="text-emerald-500" /> {o.verifiedLabel}
                </span>
              </div>
              {/* Row 2: title */}
              <p className="mt-0.5 truncate text-[12px] text-stone-500">{o.title}</p>
              {/* Row 3: price + meta on left, CTA on right */}
              <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold leading-none text-stone-900">{money(o.price)}</span>
                    {save > 0.01 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        <TrendingDown size={10} /> {money(save)}
                      </span>
                    )}
                  </div>
                  {/* Compact meta: one shipping statement · % below market */}
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-stone-400">
                    <span className={ship.free ? "font-medium text-emerald-600" : "text-stone-500"}>
                      {ship.text}
                    </span>
                    {o.pctBelow ? (
                      <>
                        <span className="text-stone-300">·</span>
                        <span className="font-medium text-emerald-600">{o.pctBelow}% under</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <a
                  href="#"
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm transition ${
                    best
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                      : "bg-stone-800 hover:bg-stone-900"
                  }`}
                >
                  View <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Shared photo block for the desktop B versions. */
function BPhoto({ o, best }: { o: MockOffer; best: boolean }) {
  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-50 ring-1 ring-stone-100">
      <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
      {best && (
        <span className="absolute left-0 top-0 inline-flex items-center gap-0.5 rounded-br-xl bg-gradient-to-r from-orange-500 to-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          <Crown size={10} /> Best
        </span>
      )}
    </div>
  );
}

function BViewBtn({
  best,
  full,
  label = "View deal",
}: {
  best: boolean;
  full?: boolean;
  label?: string;
}) {
  return (
    <a
      href="#"
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-sm transition ${
        full ? "w-full" : ""
      } ${
        best
          ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
          : "bg-stone-800 hover:bg-stone-900"
      }`}
    >
      {label} <ExternalLink size={15} />
    </a>
  );
}

/* ---- Desktop Option B · Version 1 ----
 * Price is the farthest-right element on its own. The "save" amount moves
 * UP next to the store name as a green pill. View sits under the price. */
function VariantBDesktop1({ labelMode }: { labelMode: "store" | "generic" }) {
  return (
    <div className="space-y-3">
      {OFFERS.map((o, i) => {
        const best = i === 0;
        const save = highest - o.delivered;
        const ship = shippingInfo(o);
        const label = labelMode === "store" ? `View at ${o.store}` : "View at store";
        return (
          <div
            key={o.id}
            className={`relative flex items-center gap-5 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
              best ? "border-orange-300 ring-1 ring-orange-200/70" : "border-stone-200"
            }`}
          >
            <BPhoto o={o} best={best} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-sm font-bold text-stone-700">
                  {o.store}
                </span>
                {save > 0.01 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    <TrendingDown size={11} /> save {money(save)}
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-stone-500">{o.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <BadgeCheck size={13} className="text-emerald-500" /> {o.verifiedLabel}
                </span>
                <span className={ship.free ? "font-semibold text-emerald-600" : "font-medium text-stone-500"}>
                  {ship.text}
                </span>
              </div>
            </div>
            {/* Far right: price on top, View under it */}
            <div className="flex shrink-0 flex-col items-end gap-2 pl-2 text-right">
              <span className="text-3xl font-extrabold leading-none text-stone-900">{money(o.price)}</span>
              <BViewBtn best={best} label={label} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Desktop Option B · Version 2 ----
 * Price farthest right, big, alone. The "save" amount sits in the meta row
 * (with shipping & verified) beneath the title. View is a full-width CTA
 * directly under the price so the right rail reads price → button. */
function VariantBDesktop2() {
  return (
    <div className="space-y-3">
      {OFFERS.map((o, i) => {
        const best = i === 0;
        const save = highest - o.delivered;
        const ship = shippingInfo(o);
        return (
          <div
            key={o.id}
            className={`relative flex items-center gap-5 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
              best ? "border-orange-300 ring-1 ring-orange-200/70" : "border-stone-200"
            }`}
          >
            <BPhoto o={o} best={best} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-sm font-bold text-stone-700">
                  {o.store}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <BadgeCheck size={13} className="text-emerald-500" /> {o.verifiedLabel}
                </span>
              </div>
              <p className="truncate text-sm text-stone-500">{o.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className={ship.free ? "font-semibold text-emerald-600" : "font-medium text-stone-500"}>
                  {ship.text}
                </span>
                {save > 0.01 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                    <TrendingDown size={11} /> save {money(save)}
                  </span>
                )}
                {o.pctBelow ? (
                  <span className="font-medium text-emerald-600">{o.pctBelow}% below market</span>
                ) : null}
              </div>
            </div>
            {/* Far right rail: price then full-width View */}
            <div className="flex w-32 shrink-0 flex-col items-end gap-2 pl-2 text-right">
              <span className="text-3xl font-extrabold leading-none text-stone-900">{money(o.price)}</span>
              <BViewBtn best={best} full />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Desktop Option B · Version 3 ----
 * Price farthest right and biggest, with the "save" amount shown small
 * directly UNDER the price (as a "you save" caption). View is its own
 * column just left of the price so the eye lands on price last. */
function VariantBDesktop3() {
  return (
    <div className="space-y-3">
      {OFFERS.map((o, i) => {
        const best = i === 0;
        const save = highest - o.delivered;
        const ship = shippingInfo(o);
        return (
          <div
            key={o.id}
            className={`relative flex items-center gap-5 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
              best ? "border-orange-300 ring-1 ring-orange-200/70" : "border-stone-200"
            }`}
          >
            <BPhoto o={o} best={best} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-sm font-bold text-stone-700">
                  {o.store}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <BadgeCheck size={13} className="text-emerald-500" /> {o.verifiedLabel}
                </span>
              </div>
              <p className="truncate text-sm text-stone-500">{o.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className={ship.free ? "font-semibold text-emerald-600" : "font-medium text-stone-500"}>
                  {ship.text}
                </span>
                {o.pctBelow ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                    <Tag size={11} /> {o.pctBelow}% below market
                  </span>
                ) : null}
              </div>
            </div>
            {/* View column */}
            <div className="hidden shrink-0 sm:block">
              <BViewBtn best={best} />
            </div>
            {/* Far right: price biggest, "you save" caption underneath */}
            <div className="flex shrink-0 flex-col items-end pl-2 text-right">
              <span className="text-3xl font-extrabold leading-none text-stone-900">{money(o.price)}</span>
              {save > 0.01 && (
                <span className="mt-1 text-xs font-semibold text-emerald-600">you save {money(save)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== VARIANT C ============================== *
 * "Price leaderboard" — ranked, gamified, comparison-forward. Numbered
 * ranks, photo, a savings bar visualizing price vs the most expensive,
 * and an arrow View. Feels like a deal engine; great for attracting users.
 * ==================================================================== */
function VariantC() {
  const lowest = Math.min(...OFFERS.map((o) => o.delivered));
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-gradient-to-r from-sage-600 to-emerald-600 px-4 py-2.5 text-white">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <Truck size={15} /> {OFFERS.length} stores compared
        </span>
        <span className="text-xs font-medium text-white/90">Lowest {money(lowest)}</span>
      </div>
      {OFFERS.map((o, i) => {
        const best = i === 0;
        const pct = Math.round((o.delivered / highest) * 100);
        return (
          <a
            key={o.id}
            href="#"
            className="group flex items-center gap-3 border-b border-stone-100 px-4 py-3.5 last:border-0 transition hover:bg-stone-50"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                best ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-600"
              }`}
            >
              {i + 1}
            </span>
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-50 ring-1 ring-stone-100">
              <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-stone-900">{o.store}</span>
                <span className="text-base font-extrabold text-stone-900">{money(o.price)}</span>
              </div>
              <p className="truncate text-xs text-stone-500">{o.title}</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full ${best ? "bg-emerald-500" : "bg-stone-300"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-500" />
          </a>
        );
      })}
    </div>
  );
}

/* ============================== VARIANT D ============================== *
 * "Spotlight + runners-up" — editorial. The best deal is a big featured
 * card (large photo, huge price, savings, bold CTA); the rest are compact
 * rows beneath. Draws the eye straight to the winner.
 * ==================================================================== */
function VariantD() {
  const [best, ...rest] = OFFERS;
  const save = highest - best.delivered;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border-2 border-orange-300 bg-white shadow-sm">
        <div className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
          <Crown size={13} /> Best deal for you
        </div>
        <div className="flex gap-4 p-4">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-stone-50 ring-1 ring-stone-100">
            <img src={best.img} alt={best.title} className="h-full w-full object-cover" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-bold text-stone-900">{best.store}</span>
            <p className="line-clamp-2 text-sm text-stone-500">{best.title}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-stone-900">{money(best.price)}</span>
              {save > 0.01 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  save {money(save)}
                </span>
              )}
            </div>
            <a
              href="#"
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600"
            >
              View deal <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Other stores</p>
      <ul className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {rest.map((o) => (
          <li key={o.id} className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-0">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-50 ring-1 ring-stone-100">
              <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-stone-900">{o.store}</span>
              <p className="truncate text-xs text-stone-500">{o.title}</p>
            </div>
            <span className="text-base font-extrabold text-stone-900">{money(o.price)}</span>
            <a href="#" className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-900">
              View
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================== VARIANT E ============================== *
 * "Dark premium" — moody, high-contrast cards with a neon-emerald accent.
 * Feels modern/app-like. Photo left, glowing price, ghost CTA. Stands out.
 * ==================================================================== */
function VariantE() {
  return (
    <div className="space-y-2.5">
      {OFFERS.map((o, i) => {
        const best = i === 0;
        return (
          <div
            key={o.id}
            className={`flex items-center gap-4 rounded-2xl border p-3 ${
              best
                ? "border-emerald-500/40 bg-stone-900 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                : "border-stone-700/50 bg-stone-900/95"
            }`}
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-800 ring-1 ring-white/10">
              <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{o.store}</span>
                {best && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                    Lowest
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-stone-400">{o.title}</p>
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-stone-500">
                <BadgeCheck size={12} className="text-emerald-400" /> {o.verifiedLabel}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className={`text-lg font-extrabold ${best ? "text-emerald-400" : "text-white"}`}>
                {money(o.price)}
              </span>
              <a
                href="#"
                className={`mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  best
                    ? "bg-emerald-500 text-stone-950 hover:bg-emerald-400"
                    : "border border-stone-600 text-stone-200 hover:bg-stone-800"
                }`}
              >
                View <ArrowRight size={12} />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== VARIANT F ============================== *
 * "Accent-stripe stat cards" — each offer is a card with a colored left
 * stripe (green→amber→stone by rank), photo, and a clear price + a real
 * "% below market" badge. Bright, friendly, conversion-focused.
 * ==================================================================== */
function VariantF() {
  const stripes = ["bg-emerald-500", "bg-amber-400", "bg-stone-300"];
  return (
    <div className="space-y-2.5">
      {OFFERS.map((o, i) => (
        <div
          key={o.id}
          className="flex items-stretch overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
        >
          <div className={`w-1.5 shrink-0 ${stripes[i] ?? "bg-stone-300"}`} />
          <div className="flex flex-1 items-center gap-3 p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-50 ring-1 ring-stone-100">
              <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-stone-900">{o.store}</span>
                {o.pctBelow ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <Tag size={10} /> {o.pctBelow}% below market
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-stone-500">{o.title}</p>
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-stone-400">
                <ShieldCheck size={12} className="text-stone-400" /> {o.verifiedLabel}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="text-lg font-extrabold text-stone-900">{money(o.price)}</span>
              <a
                href="#"
                className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600"
              >
                View <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================== VARIANT G ============================== *
 * "Conversational inline" — feels like the AI is handing you each option
 * mid-chat. Soft pill rows on the chat bg itself (no hard card), photo in
 * a circle, store + price inline, subtle View. Light, native to chat.
 * ==================================================================== */
function VariantG() {
  return (
    <div className="space-y-2">
      {OFFERS.map((o, i) => {
        const best = i === 0;
        return (
          <a
            key={o.id}
            href="#"
            className={`group flex items-center gap-3 rounded-full border bg-white/80 py-2 pl-2 pr-4 backdrop-blur transition hover:bg-white ${
              best ? "border-emerald-300" : "border-stone-200"
            }`}
          >
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-stone-50 ring-1 ring-stone-100">
              <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-stone-900">{o.store}</span>
              {best && <span className="ml-1.5 text-[11px] font-semibold text-emerald-600">· best</span>}
              <p className="truncate text-xs text-stone-500">{o.title}</p>
            </div>
            <span className="shrink-0 text-base font-extrabold text-stone-900">{money(o.price)}</span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white transition group-hover:bg-emerald-600">
              <ArrowRight size={14} />
            </span>
          </a>
        );
      })}
    </div>
  );
}

/* ============================== VARIANT H ============================== *
 * "Deal-engine banner rows" — punchy and marketing-forward. Full-width
 * rows with a savings bar BG fill, a lightning 'lowest' flag, delivered
 * total, and a high-contrast CTA. Built to convert and feel exciting.
 * ==================================================================== */
function VariantH() {
  const lowest = Math.min(...OFFERS.map((o) => o.delivered));
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-stone-900 px-4 py-2.5 text-white">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <Sparkles size={15} className="text-amber-400" /> Best prices, ranked
        </span>
        <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-stone-950">
          from {money(lowest)}
        </span>
      </div>
      {OFFERS.map((o, i) => {
        const best = i === 0;
        const fill = Math.round((lowest / o.delivered) * 100);
        return (
          <div key={o.id} className="relative border-b border-stone-100 last:border-0">
            <div
              className={`absolute inset-y-0 left-0 ${best ? "bg-emerald-50" : "bg-stone-50"}`}
              style={{ width: `${fill}%` }}
            />
            <div className="relative flex items-center gap-3 px-4 py-3.5">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-stone-100">
                <img src={o.img} alt={o.title} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-stone-900">{o.store}</span>
                  {best && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      <Zap size={9} /> Lowest
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-stone-500">{o.title}</p>
                <span className="text-[11px] text-stone-400">
                  {o.delivered > o.price + 0.01 ? `${money(o.delivered)} delivered` : "Free shipping"}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-lg font-extrabold text-stone-900">{money(o.price)}</span>
                <a
                  href="#"
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white ${
                    best ? "bg-emerald-600 hover:bg-emerald-700" : "bg-stone-800 hover:bg-stone-900"
                  }`}
                >
                  View
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Verified-pricing presentation formats (phone-first) ----
 * Goal: products & prices show FIRST; the "verified / pack-size fairness"
 * trust message is condensed so it no longer eats the top of the screen. */

function VerifiedFormat1() {
  // Slim trust strip — one compact line directly above the products.
  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-sage-50 px-3 py-2 text-[11px] leading-snug text-sage-800 ring-1 ring-sage-200">
        <ShieldCheck size={14} className="shrink-0 text-sage-600" />
        <span>
          <span className="font-bold">Verified live prices.</span> Pack sizes compared fairly · ships to 78701
        </span>
      </div>
      <VariantBCompact />
    </>
  );
}

function VerifiedFormat2() {
  // Tap-to-expand — products show immediately; the full sentence is tucked
  // behind a tappable "why trust this" disclosure.
  return (
    <>
      <details className="group mb-3 rounded-lg bg-white/70 ring-1 ring-sage-200">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-semibold text-sage-800">
          <ShieldCheck size={14} className="shrink-0 text-sage-600" />
          Verified live prices · ships to 78701
          <span className="ml-auto text-sage-500 group-open:hidden">Why trust this ›</span>
        </summary>
        <p className="px-3 pb-2.5 text-[11px] leading-snug text-stone-500">
          We compare pack sizes fairly so you&apos;re not misled by multipacks or variety boxes.
        </p>
      </details>
      <VariantBCompact />
    </>
  );
}

function VerifiedFormat3() {
  // Quiet footnote — products first, trust note as a small caption beneath.
  return (
    <>
      <VariantBCompact />
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-stone-400">
        <ShieldCheck size={13} className="mt-px shrink-0 text-sage-500" />
        <span>
          All prices verified live. We compare pack sizes fairly so multipacks and variety
          boxes don&apos;t mislead you · ships to 78701.
        </span>
      </p>
    </>
  );
}

const VERIFIED_FORMATS = [
  { n: "1", name: "Slim trust strip", blurb: "One compact line right above the products.", render: <VerifiedFormat1 /> },
  { n: "2", name: "Tap to expand", blurb: "Products first; full sentence hidden behind a tappable disclosure.", render: <VerifiedFormat2 /> },
  { n: "3", name: "Quiet footnote", blurb: "Products first; trust note as a small caption beneath the list.", render: <VerifiedFormat3 /> },
];

const VARIANTS = [
  { key: "A", name: "Clean rows", blurb: "Calm, scannable, premium. Best price gets a green accent.", render: <VariantA /> },
  { key: "B", name: "Hero cards", blurb: "Bold retail energy. Big photo, verified badge, savings pill, gradient CTA.", render: <VariantB /> },
  { key: "C", name: "Price leaderboard", blurb: "Ranked & gamified. Savings bars make the comparison pop.", render: <VariantC /> },
  { key: "D", name: "Spotlight + runners-up", blurb: "Editorial. Big featured best deal, compact rows beneath.", render: <VariantD /> },
  { key: "E", name: "Dark premium", blurb: "Moody, app-like, neon-emerald accent. Stands out.", render: <VariantE /> },
  { key: "F", name: "Accent-stripe cards", blurb: "Friendly stat cards with rank stripe + real % below market.", render: <VariantF /> },
  { key: "G", name: "Conversational pills", blurb: "Soft pill rows native to the chat — feels hand-picked by the AI.", render: <VariantG /> },
  { key: "H", name: "Deal-engine rows", blurb: "Punchy savings-bar rows with delivered total. Built to convert.", render: <VariantH /> },
];

/** iPhone-ish frame so you can judge how dense the list feels on a phone. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[375px] max-w-full">
      <div className="rounded-[2.75rem] border-[11px] border-stone-900 bg-stone-900 shadow-2xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-orange-50">
          {/* notch */}
          <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-stone-900" />
          {/* status bar */}
          <div className="relative z-10 flex items-center justify-between px-6 pt-2 text-[11px] font-semibold text-stone-700">
            <span>9:41</span>
            <span>Homivion</span>
          </div>
          <div className="h-[680px] overflow-y-auto px-3 pb-6 pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPreviewPage() {
  const [active, setActive] = useState<string>("all");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-stone-900">Results layout options</h1>
        <p className="mt-1 text-sm text-stone-600">
          Each shows the AI answer, then products with a little photo. Pick the one you like.
        </p>

        {/* Device toggle */}
        <div className="mt-4 inline-flex rounded-full border border-stone-300 bg-white p-1">
          {(["desktop", "phone"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                device === d ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {d === "desktop" ? "💻 Desktop" : "📱 iPhone / Android"}
            </button>
          ))}
        </div>

        {/* Verified-pricing message — 3 condensed formats, phone-first so the
            products & prices show before the trust note. */}
        <div className="mt-8 rounded-2xl border border-stone-300 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold text-stone-900">
            Verified-pricing message — 3 formats
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Products &amp; prices show first; the trust / pack-size note is condensed so it no
            longer fills the top of the screen. Shown on a phone frame.
          </p>
          <div className="mt-6 space-y-10">
            {VERIFIED_FORMATS.map((f) => (
              <div key={f.n}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-sage-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    V-{f.n}
                  </span>
                  <span className="text-sm font-bold text-stone-900">{f.name}</span>
                  <span className="text-xs text-stone-500">— {f.blurb}</span>
                </div>
                <PhoneFrame>
                  <AiAnswer />
                  <div className="mt-4">{f.render}</div>
                </PhoneFrame>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {["all", "A", "B", "C", "D", "E", "F", "G", "H"].map((k) => (
            <button
              key={k}
              onClick={() => setActive(k)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                active === k
                  ? "bg-stone-900 text-white"
                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              {k === "all" ? "Show all" : `Option ${k}`}
            </button>
          ))}
        </div>

        <div className="mt-8 space-y-12">
          {VARIANTS.filter((v) => active === "all" || active === v.key).map((v) => (
            <section key={v.key}>
              <div className="mb-3">
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-md bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                    Option {v.key}
                  </span>
                  <span className="text-base font-bold text-stone-900">{v.name}</span>
                </span>
                <p className="mt-1 text-xs text-stone-500">{v.blurb}</p>
              </div>
              {device === "phone" ? (
                <PhoneFrame>
                  <AiAnswer />
                  <div className="mt-4">{v.render}</div>
                </PhoneFrame>
              ) : (
                v.key === "B" ? (
                  <div className="space-y-6">
                    {[
                      { n: "1", label: "button shows the real store — “View at Walmart / Amazon / Target”", render: <VariantBDesktop1 labelMode="store" /> },
                      { n: "2", label: "button always says “View at store”", render: <VariantBDesktop1 labelMode="generic" /> },
                    ].map((bv) => (
                      <div key={bv.n}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded bg-stone-900 px-2 py-0.5 text-[11px] font-bold text-white">
                            B-{bv.n}
                          </span>
                          <span className="text-xs text-stone-500">{bv.label}</span>
                        </div>
                        <div className="rounded-3xl bg-orange-50 p-4 sm:p-5">
                          <AiAnswer />
                          <div className="mt-4">{bv.render}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl bg-orange-50 p-4 sm:p-5">
                    <AiAnswer />
                    <div className="mt-4">{v.render}</div>
                  </div>
                )
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
