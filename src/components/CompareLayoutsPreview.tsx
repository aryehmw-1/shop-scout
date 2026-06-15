"use client";

// PREVIEW-ONLY (/compare/layouts): 5 desktop compare-page layouts, REMADE so
// every option shows a product PHOTO for each offer/alternative — the page should
// feel like shopping, not a spreadsheet. Each layout: 5–7 exact-match offers with
// photo + scannable price + clear retailer + Fresh/Aging/Stale + verified + View,
// and a clearly SEPARATED "Similar products" rail so exact matches never blur into
// alternatives. Sample data only; pick one and I'll apply it to the real compare view.

import { ShieldCheck, Crown, Clock, ExternalLink, Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { ProductImage } from "@/components/ProductImage";

type Fresh = "Fresh" | "Aging" | "Stale";
interface Offer {
  retailer: string;
  price: number;
  fresh: Fresh;
  checked: string;
  verified: boolean;
}
interface AltProduct {
  title: string;
  price: number;
  retailer: string;
  fresh: Fresh;
  image: string;
}

const PRODUCT = "Ninja Air Fryer Max XL, 5.5 Qt";
// Same exact item across retailers → same product photo.
const PHOTO = "https://placehold.co/240x240/fde68a/92400e?text=Ninja+Air+Fryer";
const OFFERS: Offer[] = ([
  { retailer: "Walmart", price: 89.99, fresh: "Fresh", checked: "2h ago", verified: true },
  { retailer: "Amazon", price: 94.95, fresh: "Fresh", checked: "1h ago", verified: true },
  { retailer: "Target", price: 99.99, fresh: "Aging", checked: "2d ago", verified: true },
  { retailer: "Best Buy", price: 104.99, fresh: "Fresh", checked: "5h ago", verified: true },
  { retailer: "Kohl's", price: 109.99, fresh: "Aging", checked: "3d ago", verified: true },
  { retailer: "eBay", price: 114.5, fresh: "Stale", checked: "8d ago", verified: false },
] as Offer[]).sort((a, b) => a.price - b.price);

// Different items — "people also compared". Each has its OWN photo so the eye
// reads them as separate products, not more offers for the same air fryer.
const ALTS: AltProduct[] = [
  { title: "Cosori Pro II 5.8 Qt", price: 99.99, retailer: "Amazon", fresh: "Fresh", image: "https://placehold.co/240x240/dbeafe/1e40af?text=Cosori+Pro+II" },
  { title: "Instant Vortex Plus 6 Qt", price: 119.99, retailer: "Target", fresh: "Fresh", image: "https://placehold.co/240x240/dcfce7/166534?text=Instant+Vortex" },
  { title: "Philips Essential Airfryer", price: 139.99, retailer: "Best Buy", fresh: "Aging", image: "https://placehold.co/240x240/ede9fe/5b21b6?text=Philips+Airfryer" },
];

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
function Verified({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-700"><ShieldCheck size={12} /> Verified</span>
  ) : (
    <span className="text-[11px] font-medium text-stone-400">Unverified seller</span>
  );
}
function ViewBtn({ best, full }: { best?: boolean; full?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm font-bold text-white ${full ? "w-full" : ""} ${best ? "bg-gradient-to-r from-orange-500 to-amber-500" : "bg-stone-900"}`}>
      View <ExternalLink size={13} />
    </span>
  );
}
function Photo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white ${className ?? ""}`}>
      <ProductImage src={src} alt={alt} className="h-full w-full object-contain" />
    </div>
  );
}

// Shared "Similar products" rail — visually separated from the exact matches with
// a dashed divider + muted heading so alternatives never read as the same item.
function AltRail() {
  return (
    <div className="mt-5 border-t border-dashed border-stone-300 pt-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-400">
        <Sparkles size={13} /> Similar products — not the same item
      </p>
      <div className="grid grid-cols-3 gap-3">
        {ALTS.map((a) => (
          <div key={a.title} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-2.5">
            <Photo src={a.image} alt={a.title} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-[13px] font-semibold text-stone-800">{a.title}</p>
              <p className="text-sm font-extrabold text-sage-800">{formatPrice(a.price)} <span className="text-[11px] font-normal text-stone-400">· {a.retailer}</span></p>
            </div>
            <span className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700">View</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExactHeader() {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sage-700">
      <ShieldCheck size={13} /> Exact match · {OFFERS.length} retailers
    </p>
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

// L1 — Shopping rows: photo + retailer + trust + big price + View, roomy.
function L1() {
  return (
    <>
      <ExactHeader />
      <div className="space-y-2">
        {OFFERS.map((o, i) => (
          <div key={o.retailer} className={`flex items-center gap-4 rounded-xl border p-3 ${i === 0 ? "border-orange-300 bg-orange-50/40" : "border-stone-200"}`}>
            <Photo src={PHOTO} alt={PRODUCT} className="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-bold text-stone-900">
                {o.retailer}
                {i === 0 && <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white"><Crown size={10} /> Lowest</span>}
              </p>
              <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{PRODUCT}</p>
              <p className="mt-1 flex items-center gap-2"><FreshChip f={o.fresh} small /> <Verified on={o.verified} /></p>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-stone-400"><Clock size={11} /> {o.checked}</p>
            <p className="w-24 text-right text-2xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
            <ViewBtn best={i === 0} />
          </div>
        ))}
      </div>
      <AltRail />
    </>
  );
}

// L2 — Gallery columns: photo on top of each column, big price, fresh + verified.
function L2() {
  return (
    <>
      <ExactHeader />
      <div className="grid grid-cols-6 gap-3">
        {OFFERS.map((o, i) => (
          <div key={o.retailer} className={`flex flex-col rounded-xl border p-3 text-center ${i === 0 ? "border-orange-300 ring-1 ring-orange-200" : "border-stone-200"}`}>
            {i === 0 ? <span className="mb-2 inline-flex items-center justify-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white"><Crown size={10} /> Best</span> : <span className="mb-2 h-[18px]" />}
            <Photo src={PHOTO} alt={PRODUCT} className="mx-auto h-20 w-20" />
            <p className="mt-2 text-[13px] font-bold text-stone-900">{o.retailer}</p>
            <p className="my-1 text-xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
            <div className="flex justify-center"><FreshChip f={o.fresh} small /></div>
            <div className="mt-0.5 flex justify-center"><Verified on={o.verified} /></div>
            <p className="mt-1 text-[10px] text-stone-400">{o.checked}</p>
            <div className="mt-2"><ViewBtn best={i === 0} full /></div>
          </div>
        ))}
      </div>
      <AltRail />
    </>
  );
}

// L3 — Hero photo + offer rail: a big product image anchors the page, offers stack
// to the right. Most "shopping detail page" feel.
function L3() {
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col rounded-2xl border border-stone-200 bg-stone-50/60 p-4 text-center">
          <Photo src={PHOTO} alt={PRODUCT} className="mx-auto h-44 w-44" />
          <h3 className="mt-3 text-base font-bold leading-snug text-stone-900">{PRODUCT}</h3>
          <p className="mt-1 text-xs text-stone-500">Best price across {OFFERS.length} retailers</p>
          <p className="mt-2 text-3xl font-black text-sage-800">{formatPrice(OFFERS[0].price)}</p>
          <p className="text-xs font-semibold text-emerald-600">save {formatPrice(highest - OFFERS[0].price)} vs highest</p>
        </div>
        <div>
          <ExactHeader />
          <div className="space-y-2">
            {OFFERS.map((o, i) => (
              <div key={o.retailer} className={`flex items-center gap-3 rounded-xl border p-2.5 ${i === 0 ? "border-orange-300 bg-orange-50/40" : "border-stone-200"}`}>
                <Photo src={PHOTO} alt={PRODUCT} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-stone-900">{o.retailer} {i === 0 && <Crown size={12} className="inline text-orange-500" />}</p>
                  <p className="flex items-center gap-2"><FreshChip f={o.fresh} small /> <Verified on={o.verified} /></p>
                </div>
                <p className="text-[11px] text-stone-400">{o.checked}</p>
                <p className="w-20 text-right text-xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
                <ViewBtn best={i === 0} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <AltRail />
    </>
  );
}

// L4 — Price leaderboard with thumbnails: ranked value-first, photo on each row.
function L4() {
  return (
    <>
      <ExactHeader />
      <div className="space-y-2">
        {OFFERS.map((o, i) => (
          <div key={o.retailer} className={`flex items-center gap-4 rounded-xl border p-3 ${i === 0 ? "border-orange-300 bg-orange-50/50" : "border-stone-200"}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-orange-500 text-white" : "bg-stone-100 text-stone-500"}`}>{i + 1}</span>
            <Photo src={PHOTO} alt={PRODUCT} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-stone-900">{o.retailer}</p>
              <p className="mt-0.5 flex items-center gap-2"><FreshChip f={o.fresh} small /> <Verified on={o.verified} /> <span className="text-[11px] text-stone-400">· {o.checked}</span></p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
              {i === 0 ? <p className="text-[11px] font-semibold text-emerald-600">save {formatPrice(highest - o.price)} vs highest</p> : <p className="text-[11px] text-stone-400">+{formatPrice(o.price - OFFERS[0].price)} more</p>}
            </div>
            <ViewBtn best={i === 0} />
          </div>
        ))}
      </div>
      <AltRail />
    </>
  );
}

// L5 — Rich shopping cards grid: large photo cards, most catalog-like.
function L5() {
  return (
    <>
      <ExactHeader />
      <div className="grid grid-cols-3 gap-4">
        {OFFERS.map((o, i) => (
          <div key={o.retailer} className={`flex flex-col overflow-hidden rounded-2xl border ${i === 0 ? "border-orange-300 ring-1 ring-orange-200" : "border-stone-200"}`}>
            <div className="relative bg-stone-50 p-4">
              <Photo src={PHOTO} alt={PRODUCT} className="mx-auto h-28 w-28 border-0 bg-transparent" />
              {i === 0 && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white"><Crown size={10} /> Lowest</span>}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900">{o.retailer}</span>
                <FreshChip f={o.fresh} small />
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-stone-500">{PRODUCT}</p>
              <p className="my-2 text-2xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
              <div className="mb-3"><Verified on={o.verified} /></div>
              <div className="mt-auto"><ViewBtn best={i === 0} full /></div>
            </div>
          </div>
        ))}
      </div>
      <AltRail />
    </>
  );
}

export function CompareLayoutsPreview() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="font-homy text-2xl font-bold text-ink-900">Desktop compare layouts — preview (v2, with photos)</h1>
      <p className="mb-2 text-sm text-stone-500">
        Sample: <strong>{PRODUCT}</strong> across {OFFERS.length} retailers (cheapest first). Every layout shows a product photo, keeps prices scannable, surfaces Fresh/Aging/Stale + verified, and separates exact matches from similar products. Pick one and I&apos;ll apply it to the real desktop compare view.
      </p>
      <p className="mb-8 text-sm font-semibold text-sage-800">Best price: {formatPrice(OFFERS[0].price)} at {OFFERS[0].retailer}</p>
      <Section id="L1" name="Shopping rows" blurb="Roomy photo rows — thumbnail, retailer, trust, big price, View. Friendly + scannable.">{<L1 />}</Section>
      <Section id="L2" name="Gallery columns" blurb="Photo-topped columns — eyeball all 5–7 at once, big prices, Best highlighted.">{<L2 />}</Section>
      <Section id="L3" name="Hero + offer rail" blurb="Big product hero anchors the page; compact photo offers stack beside it. Detail-page feel.">{<L3 />}</Section>
      <Section id="L4" name="Price leaderboard" blurb="Ranked 1..N with thumbnails + savings vs highest — value-first.">{<L4 />}</Section>
      <Section id="L5" name="Rich shopping cards" blurb="Large-photo catalog cards filling the width. Most 'shopping', least table.">{<L5 />}</Section>
    </div>
  );
}
