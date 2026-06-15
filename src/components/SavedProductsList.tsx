"use client";

// Real Saved Products list. Mobile = P2 list rows; Desktop = D4 trust-forward
// cards (verified badge + retailer), widened to fill the screen. Every item has
// a heart (remove), Compare, and Go to store.

import Link from "next/link";
import { Heart, Store, ShieldCheck } from "lucide-react";
import type { ProductOffer, RetailerId } from "@/lib/types";
import { affiliateSafeDestination } from "@/lib/affiliate/outbound";
import { formatPrice } from "@/lib/utils/format";
import { ProductImage } from "@/components/ProductImage";

interface Props {
  offers: ProductOffer[];
  onRemove: (id: string) => void;
}

const compareHref = (o: ProductOffer) =>
  o.catalogId ? `/compare?product=${encodeURIComponent(o.catalogId)}` : `/chat?q=${encodeURIComponent(`${o.brand} ${o.title}`)}`;
const storeHref = (o: ProductOffer) =>
  affiliateSafeDestination(o.retailer as RetailerId, o.productUrl || o.affiliateUrl || "");

export function SavedProductsList({ offers, onRemove }: Props) {
  return (
    <>
      {/* ── Mobile: P2 list rows ── */}
      <div className="space-y-2 lg:hidden">
        {offers.map((o) => {
          const dest = storeHref(o);
          return (
            <article key={o.id} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-2.5">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-50">
                <ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-1" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 text-[13px] font-semibold text-stone-900">{o.brand} {o.title}</h3>
                  <button onClick={() => onRemove(o.id)} aria-label="Remove from saved" className="shrink-0 text-red-400 hover:text-red-500">
                    <Heart size={16} fill="currentColor" />
                  </button>
                </div>
                <p className="text-sm font-bold text-sage-800">{formatPrice(o.price)} <span className="text-[10px] font-normal text-stone-400">· {o.retailerName ?? o.retailer}</span></p>
                <div className="mt-1 flex gap-1.5">
                  <Link href={compareHref(o)} className="flex-1 rounded-lg bg-sage-700 py-1 text-center text-[11px] font-semibold text-white">Compare</Link>
                  {dest && <a href={dest} target="_blank" rel="noopener noreferrer sponsored" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-orange-200 py-1 text-[11px] font-semibold text-orange-600"><Store size={12} /> Go to store</a>}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* ── Desktop: D4 trust-forward cards, full-width grid ── */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-3 xl:grid-cols-4">
        {offers.map((o) => {
          const dest = storeHref(o);
          return (
            <article key={o.id} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between border-b border-stone-100 px-3 py-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-700"><ShieldCheck size={13} /> Verified price</span>
                <button onClick={() => onRemove(o.id)} aria-label="Remove from saved" className="text-red-400 hover:text-red-500"><Heart size={16} fill="currentColor" /></button>
              </div>
              <div className="relative aspect-[4/3] bg-stone-50"><ProductImage src={o.imageUrl} alt={o.title} className="h-full w-full object-contain p-3" /></div>
              <div className="flex flex-1 flex-col p-3">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900">{o.brand} {o.title}</h3>
                <p className="mt-1 text-lg font-bold text-sage-800">{formatPrice(o.price)}</p>
                <p className="text-[11px] text-stone-400">{o.retailerName ?? o.retailer}</p>
                <div className="mt-3 flex gap-2">
                  <Link href={compareHref(o)} className="flex-1 rounded-xl bg-sage-700 py-2 text-center text-sm font-semibold text-white hover:bg-sage-800">Compare</Link>
                  {dest && <a href={dest} target="_blank" rel="noopener noreferrer sponsored" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-200 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50"><Store size={14} /> Store</a>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
