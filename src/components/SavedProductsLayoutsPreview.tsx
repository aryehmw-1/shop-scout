"use client";

// PREVIEW-ONLY (/saved/layouts): Saved Products shown in several layouts for
// phone AND desktop, so we can pick before changing the real /saved page. Every
// card has BOTH a Compare action and a "Go to store" action. Uses sample data so
// the designs render even with nothing saved yet.

import Link from "next/link";
import { ExternalLink, Store, Heart, ShieldCheck, Clock } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { formatPrice } from "@/lib/utils/format";

type Freshness = "Fresh" | "Aging" | "Stale";
interface SampleOffer {
  id: string;
  title: string;
  brand: string;
  retailerName: string;
  price: number;
  imageUrl: string;
  catalogId: string;
  storeUrl: string;
  freshness: Freshness;
  lastChecked: string;
}

const SAMPLE: SampleOffer[] = [
  { id: "1", brand: "Dawn", title: "Ultra Liquid Dish Soap, Original Scent, 19.4 oz", retailerName: "Amazon", price: 4.97, catalogId: "c1", imageUrl: "https://i5.walmartimages.com/seo/Dawn.jpg", storeUrl: "https://www.amazon.com/dp/x", freshness: "Fresh", lastChecked: "2h ago" },
  { id: "2", brand: "Bounty", title: "Quick-Size Paper Towels, 8 Family Rolls", retailerName: "Walmart", price: 19.94, catalogId: "c2", imageUrl: "https://i5.walmartimages.com/seo/Bounty.jpg", storeUrl: "https://www.walmart.com/ip/x", freshness: "Aging", lastChecked: "3d ago" },
  { id: "3", brand: "IKEA", title: "TÄRNABY Table lamp, dimmable anthracite", retailerName: "IKEA", price: 49.99, catalogId: "c3", imageUrl: "https://www.ikea.com/tarnaby.jpg", storeUrl: "https://www.ikea.com/p/x", freshness: "Fresh", lastChecked: "1h ago" },
  { id: "4", brand: "ACDelco", title: "AA Batteries, 100-Count Super Alkaline", retailerName: "Amazon", price: 24.99, catalogId: "c4", imageUrl: "https://i5.walmartimages.com/seo/acdelco.jpg", storeUrl: "https://www.amazon.com/dp/y", freshness: "Stale", lastChecked: "9d ago" },
];

const FRESH_STYLE: Record<Freshness, string> = {
  Fresh: "bg-emerald-100 text-emerald-800",
  Aging: "bg-amber-100 text-amber-800",
  Stale: "bg-stone-200 text-stone-600",
};

function FreshnessBadge({ o, small }: { o: SampleOffer; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${FRESH_STYLE[o.freshness]} ${small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> {o.freshness}
    </span>
  );
}

const compareHref = (o: SampleOffer) => `/compare?product=${encodeURIComponent(o.catalogId)}`;

function CompareBtn({ o, className = "" }: { o: SampleOffer; className?: string }) {
  return (
    <Link href={compareHref(o)} className={className}>
      Compare
    </Link>
  );
}
function StoreBtn({ o, className = "", label = "Go to store" }: { o: SampleOffer; className?: string; label?: string }) {
  return (
    <a href={o.storeUrl} target="_blank" rel="noopener noreferrer sponsored" className={className}>
      <Store size={14} /> {label}
    </a>
  );
}

function Frame({ title, blurb, width, children }: { title: string; blurb: string; width: number; children: React.ReactNode }) {
  const isPhone = width <= 430;
  return (
    <div className="flex flex-col">
      <h2 className="text-sm font-bold text-stone-900">{title}</h2>
      <p className="mb-2 text-xs text-stone-500">{blurb}</p>
      <div
        className={`mx-auto w-full overflow-hidden bg-cream-50 shadow-xl ${isPhone ? "rounded-[2rem] border-8 border-stone-900 p-3" : "rounded-xl border border-stone-300 p-4"}`}
        style={{ maxWidth: width }}
      >
        <div className="max-h-[640px] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ── PHONE 1: compact card, two stacked actions ────────────────────────────────
function Phone1() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SAMPLE.map((o) => (
        <article key={o.id} className="relative flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="relative aspect-square bg-stone-50">
            <ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-1.5" />
            <Heart size={15} className="absolute right-1.5 top-1.5 text-red-400" fill="currentColor" />
          </div>
          <div className="flex flex-1 flex-col p-2">
            <h3 className="line-clamp-2 text-[12px] font-semibold leading-tight text-stone-900">{o.brand} {o.title}</h3>
            <p className="mt-0.5 text-sm font-bold text-sage-800">{formatPrice(o.price)} <span className="text-[10px] font-normal text-stone-400">{o.retailerName}</span></p>
            <div className="mt-1.5 flex flex-col gap-1">
              <CompareBtn o={o} className="flex items-center justify-center gap-1 rounded-lg bg-sage-700 py-1 text-[11px] font-semibold text-white" />
              <StoreBtn o={o} className="flex items-center justify-center gap-1 rounded-lg border border-stone-200 py-1 text-[11px] font-semibold text-orange-600" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ── PHONE 2: list rows, side-by-side actions ──────────────────────────────────
function Phone2() {
  return (
    <div className="space-y-2">
      {SAMPLE.map((o) => (
        <article key={o.id} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-2.5">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-50">
            <ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-1" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="line-clamp-1 text-[13px] font-semibold text-stone-900">{o.brand} {o.title}</h3>
            <p className="text-sm font-bold text-sage-800">{formatPrice(o.price)} <span className="text-[10px] font-normal text-stone-400">· {o.retailerName}</span></p>
            <div className="mt-1 flex gap-1.5">
              <CompareBtn o={o} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-sage-700 py-1 text-[11px] font-semibold text-white" />
              <StoreBtn o={o} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-stone-200 py-1 text-[11px] font-semibold text-orange-600" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ── DESKTOP 1: grid cards, actions in a row ───────────────────────────────────
function Desktop1() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SAMPLE.map((o) => (
        <article key={o.id} className="relative flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="relative aspect-square bg-stone-50">
            <ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-3" />
            <Heart size={18} className="absolute right-2 top-2 text-red-400" fill="currentColor" />
          </div>
          <div className="flex flex-1 flex-col p-3">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900">{o.brand} {o.title}</h3>
            <p className="mt-1 text-lg font-bold text-sage-800">{formatPrice(o.price)}</p>
            <p className="text-xs text-stone-400">{o.retailerName}</p>
            <div className="mt-3 flex gap-2">
              <CompareBtn o={o} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sage-700 py-2 text-sm font-semibold text-white hover:bg-sage-800" />
              <StoreBtn o={o} label="Store" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-200 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ── DESKTOP 2: wide rows, image | info | actions on the right ─────────────────
function Desktop2() {
  return (
    <div className="space-y-3">
      {SAMPLE.map((o) => (
        <article key={o.id} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-50">
            <ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-2" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-base font-semibold text-stone-900">{o.brand} {o.title}</h3>
            <p className="text-sm text-stone-400">{o.retailerName}</p>
          </div>
          <p className="shrink-0 text-xl font-bold text-sage-800">{formatPrice(o.price)}</p>
          <div className="flex shrink-0 gap-2">
            <CompareBtn o={o} className="flex items-center gap-1.5 rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800" />
            <StoreBtn o={o} className="flex items-center gap-1.5 rounded-xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50" />
          </div>
        </article>
      ))}
    </div>
  );
}

// ── DESKTOP 3: comparison TABLE — max quick-compare across saved items ────────
function Desktop3() {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-400">
          <th className="py-2 pr-2 font-semibold">Product</th>
          <th className="px-2 font-semibold">Retailer</th>
          <th className="px-2 font-semibold">Status</th>
          <th className="px-2 text-right font-semibold">Price</th>
          <th className="px-2 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody>
        {[...SAMPLE].sort((a, b) => a.price - b.price).map((o, i) => (
          <tr key={o.id} className={`border-b border-stone-100 ${i === 0 ? "bg-sage-50/40" : ""}`}>
            <td className="py-2 pr-2">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-stone-50"><ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-0.5" /></div>
                <span className="line-clamp-1 font-medium text-stone-900">{o.brand} {o.title}</span>
              </div>
            </td>
            <td className="px-2 text-stone-600">{o.retailerName}</td>
            <td className="px-2"><FreshnessBadge o={o} small /></td>
            <td className="px-2 text-right">
              <span className="font-bold text-sage-800">{formatPrice(o.price)}</span>
              {i === 0 && <span className="ml-1 rounded bg-sage-700 px-1 py-0.5 text-[9px] font-semibold text-white">LOWEST</span>}
            </td>
            <td className="px-2">
              <div className="flex justify-end gap-1.5">
                <CompareBtn o={o} className="rounded-lg bg-sage-700 px-2.5 py-1 text-xs font-semibold text-white" />
                <StoreBtn o={o} label="Store" className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1 text-xs font-semibold text-orange-600" />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── DESKTOP 4: trust-forward cards — verified badge, freshness, last-checked ───
function Desktop4() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SAMPLE.map((o) => (
        <article key={o.id} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-3 py-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-700"><ShieldCheck size={13} /> Verified price</span>
            <FreshnessBadge o={o} small />
          </div>
          <div className="relative aspect-[4/3] bg-stone-50"><ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-3" /></div>
          <div className="flex flex-1 flex-col p-3">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900">{o.brand} {o.title}</h3>
            <p className="mt-1 text-lg font-bold text-sage-800">{formatPrice(o.price)}</p>
            <p className="flex items-center gap-1 text-[11px] text-stone-400"><Clock size={11} /> checked {o.lastChecked} · {o.retailerName}</p>
            <div className="mt-3 flex gap-2">
              <CompareBtn o={o} className="flex-1 rounded-xl bg-sage-700 py-2 text-center text-sm font-semibold text-white hover:bg-sage-800" />
              <StoreBtn o={o} label="Store" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-200 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ── DESKTOP 5: price-led rows — big price column for fast value scanning ───────
function Desktop5() {
  return (
    <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
      {[...SAMPLE].sort((a, b) => a.price - b.price).map((o) => (
        <article key={o.id} className="flex items-center gap-4 p-3">
          <div className="w-24 shrink-0 text-right">
            <p className="text-2xl font-extrabold text-sage-800">{formatPrice(o.price)}</p>
            <p className="text-[10px] text-stone-400">{o.retailerName}</p>
          </div>
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-stone-50"><ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-1" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-base font-semibold text-stone-900">{o.brand} {o.title}</h3>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-400"><FreshnessBadge o={o} small /> <span className="inline-flex items-center gap-1"><Clock size={10} /> {o.lastChecked}</span></p>
          </div>
          <div className="flex shrink-0 gap-2">
            <CompareBtn o={o} className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800" />
            <StoreBtn o={o} className="flex items-center gap-1.5 rounded-xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function SavedProductsLayoutsPreview() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 font-homy text-2xl font-bold text-ink-900">Saved Products layouts — preview</h1>
      <p className="mb-6 text-sm text-stone-500">
        Sample data. Every card has <strong>Compare</strong> and <strong>Go to store</strong>. Pick a phone option + a desktop option and I’ll apply them to /saved.
      </p>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">📱 Phone</h2>
      <div className="mb-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <Frame title="P1 · Compact cards" blurb="2-col, stacked Compare + Store buttons." width={390}><Phone1 /></Frame>
        <Frame title="P2 · List rows" blurb="Row per item, side-by-side buttons." width={390}><Phone2 /></Frame>
      </div>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">💻 Desktop</h2>
      <div className="grid gap-8">
        <Frame title="D1 · Grid cards" blurb="3-col cards, Compare + Store in a row." width={900}><Desktop1 /></Frame>
        <Frame title="D2 · Wide rows" blurb="Image | info | price | actions on the right." width={900}><Desktop2 /></Frame>
        <Frame title="D3 · Comparison table" blurb="Sortable-style table; cheapest row highlighted + LOWEST tag. Max quick-compare." width={900}><Desktop3 /></Frame>
        <Frame title="D4 · Trust-forward cards" blurb="Verified-price badge, freshness + last-checked on every card." width={900}><Desktop4 /></Frame>
        <Frame title="D5 · Price-led rows" blurb="Big price column first for fast value scanning; freshness + checked time." width={900}><Desktop5 /></Frame>
      </div>
    </div>
  );
}
