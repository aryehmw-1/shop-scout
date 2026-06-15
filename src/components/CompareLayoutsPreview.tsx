"use client";

// PREVIEW-ONLY (/compare/layouts): 5 desktop compare-page layouts using full
// screen width, to pick before changing the real compare view. Sample data:
// one product (an air fryer) across several retailers, varied price + freshness.

import { ShieldCheck, Crown, Clock, ExternalLink } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";

type Fresh = "Fresh" | "Aging" | "Stale";
interface Offer {
  retailer: string;
  price: number;
  fresh: Fresh;
  checked: string;
  verified: boolean;
}

const PRODUCT = "Ninja Air Fryer Max XL, 5.5 Qt";
const OFFERS: Offer[] = ([
  { retailer: "Walmart", price: 89.99, fresh: "Fresh", checked: "2h ago", verified: true },
  { retailer: "Amazon", price: 94.95, fresh: "Fresh", checked: "1h ago", verified: true },
  { retailer: "Target", price: 99.99, fresh: "Aging", checked: "2d ago", verified: true },
  { retailer: "Best Buy", price: 104.99, fresh: "Fresh", checked: "5h ago", verified: true },
  { retailer: "Kohl's", price: 109.99, fresh: "Aging", checked: "3d ago", verified: true },
  { retailer: "eBay", price: 114.50, fresh: "Stale", checked: "8d ago", verified: false },
  { retailer: "Macy's", price: 129.99, fresh: "Fresh", checked: "4h ago", verified: true },
] as Offer[]).sort((a, b) => a.price - b.price);

const FRESH_STYLE: Record<Fresh, string> = {
  Fresh: "bg-emerald-100 text-emerald-800",
  Aging: "bg-amber-100 text-amber-800",
  Stale: "bg-stone-200 text-stone-600",
};
const highest = Math.max(...OFFERS.map((o) => o.price));

function FreshChip({ f, small }: { f: Fresh; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${FRESH_STYLE[f]} ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{f}
    </span>
  );
}
function ViewBtn({ best }: { best?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm font-bold text-white ${best ? "bg-gradient-to-r from-orange-500 to-amber-500" : "bg-stone-900"}`}>
      View <ExternalLink size={13} />
    </span>
  );
}
function Section({ id, name, blurb, children }: { id: string; name: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg font-bold text-stone-900">{id} · {name}</h2>
      <p className="mb-3 text-sm text-stone-500">{blurb}</p>
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">{children}</div>
    </section>
  );
}

// L1 — full-width comparison TABLE
function L1() {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-400">
          <th className="py-2 pr-4 font-semibold">Retailer</th>
          <th className="px-4 font-semibold">Status</th>
          <th className="px-4 font-semibold">Last checked</th>
          <th className="px-4 text-right font-semibold">Price</th>
          <th className="px-4 text-right font-semibold">You save</th>
          <th className="px-4 text-right font-semibold">Action</th>
        </tr>
      </thead>
      <tbody>
        {OFFERS.map((o, i) => (
          <tr key={o.retailer} className={`border-b border-stone-100 ${i === 0 ? "bg-orange-50/50" : ""}`}>
            <td className="py-3 pr-4 font-semibold text-stone-900">
              {i === 0 && <Crown size={13} className="mr-1 inline text-orange-500" />}{o.retailer}
              {o.verified && <ShieldCheck size={13} className="ml-1 inline text-sage-600" />}
            </td>
            <td className="px-4"><FreshChip f={o.fresh} small /></td>
            <td className="px-4 text-stone-500">{o.checked}</td>
            <td className="px-4 text-right text-lg font-bold text-sage-800">{formatPrice(o.price)}</td>
            <td className="px-4 text-right text-emerald-600">{i === 0 ? `${formatPrice(highest - o.price)}` : "—"}</td>
            <td className="px-4 text-right"><ViewBtn best={i === 0} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// L2 — side-by-side product COLUMNS (compare several at a glance)
function L2() {
  return (
    <div className="grid grid-cols-7 gap-3">
      {OFFERS.map((o, i) => (
        <div key={o.retailer} className={`flex flex-col rounded-xl border p-3 text-center ${i === 0 ? "border-orange-300 ring-1 ring-orange-200" : "border-stone-200"}`}>
          {i === 0 ? <span className="mb-1 inline-flex items-center justify-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white"><Crown size={10} /> Best</span> : <span className="mb-1 h-[18px]" />}
          <p className="text-[13px] font-bold text-stone-900">{o.retailer}</p>
          <p className="my-1 text-xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
          <FreshChip f={o.fresh} small />
          <p className="mt-1 text-[10px] text-stone-400">{o.checked}</p>
          <div className="mt-2"><ViewBtn best={i === 0} /></div>
        </div>
      ))}
    </div>
  );
}

// L3 — wide horizontal rows (rich, scannable)
function L3() {
  return (
    <div className="space-y-2">
      {OFFERS.map((o, i) => (
        <div key={o.retailer} className={`flex items-center gap-5 rounded-xl border p-3 ${i === 0 ? "border-orange-300 bg-orange-50/40" : "border-stone-200"}`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-stone-100 text-xs font-bold text-stone-600">{o.retailer.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-stone-900">{o.retailer} {o.verified && <ShieldCheck size={13} className="inline text-sage-600" />}</p>
            <p className="flex items-center gap-2 text-xs text-stone-400"><FreshChip f={o.fresh} small /> <span className="inline-flex items-center gap-1"><Clock size={11} /> checked {o.checked}</span></p>
          </div>
          {i === 0 && <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-bold text-orange-700">Lowest price</span>}
          <p className="w-24 text-right text-2xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
          <ViewBtn best={i === 0} />
        </div>
      ))}
    </div>
  );
}

// L4 — price leaderboard (value-first ranked list)
function L4() {
  return (
    <div className="mx-auto max-w-3xl space-y-2">
      {OFFERS.map((o, i) => (
        <div key={o.retailer} className={`flex items-center gap-4 rounded-xl border p-3 ${i === 0 ? "border-orange-300 bg-orange-50/50" : "border-stone-200"}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-500"}`}>{i + 1}</span>
          <div className="flex-1">
            <p className="font-semibold text-stone-900">{o.retailer}</p>
            <p className="text-xs text-stone-400">{o.fresh} · {o.checked}{o.verified ? " · verified" : ""}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
            {i === 0 ? <p className="text-[11px] font-semibold text-emerald-600">save {formatPrice(highest - o.price)} vs highest</p> : <p className="text-[11px] text-stone-400">+{formatPrice(o.price - OFFERS[0].price)}</p>}
          </div>
          <ViewBtn best={i === 0} />
        </div>
      ))}
    </div>
  );
}

// L5 — rich grid using full width
function L5() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {OFFERS.map((o, i) => (
        <div key={o.retailer} className={`flex flex-col rounded-xl border p-4 ${i === 0 ? "border-orange-300 ring-1 ring-orange-200" : "border-stone-200"}`}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-stone-900">{o.retailer}</span>
            {i === 0 && <Crown size={15} className="text-orange-500" />}
          </div>
          <p className="my-2 text-2xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
          <div className="mb-3 flex items-center gap-2"><FreshChip f={o.fresh} small />{o.verified && <ShieldCheck size={13} className="text-sage-600" />}</div>
          <div className="mt-auto"><ViewBtn best={i === 0} /></div>
        </div>
      ))}
    </div>
  );
}

export function CompareLayoutsPreview() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="font-homy text-2xl font-bold text-ink-900">Desktop compare layouts — preview</h1>
      <p className="mb-2 text-sm text-stone-500">
        Sample: <strong>{PRODUCT}</strong> across {OFFERS.length} retailers (sorted cheapest first). Pick one and I&apos;ll apply it to the desktop compare view.
      </p>
      <p className="mb-8 text-sm font-semibold text-sage-800">Best price: {formatPrice(OFFERS[0].price)} at {OFFERS[0].retailer}</p>
      <Section id="L1" name="Comparison table" blurb="Full-width table — retailer, status, last-checked, price, savings, action. Densest scan.">{<L1 />}</Section>
      <Section id="L2" name="Side-by-side columns" blurb="One column per offer — compare 5–7 at a glance, big prices, Best highlighted.">{<L2 />}</Section>
      <Section id="L3" name="Wide rows" blurb="Roomy horizontal rows; trust + last-checked inline, big price + View on the right.">{<L3 />}</Section>
      <Section id="L4" name="Price leaderboard" blurb="Ranked 1..N with savings vs highest — value-first, centered.">{<L4 />}</Section>
      <Section id="L5" name="Rich grid" blurb="4-up cards filling the width; price-forward with trust chips.">{<L5 />}</Section>
    </div>
  );
}
