"use client";

// Real Saved Products list.
//   Mobile  = P2 list rows inside a FIXED-HEIGHT pane that scrolls vertically, so
//             the page never grows endlessly and the footer stays reachable.
//   Desktop = D4 trust-forward cards laid out in TWO rows; once both rows fill,
//             the container height is fixed and extra products continue
//             horizontally. Left/right arrows appear only when there is more to
//             scroll in that direction.
// Every item has a heart (remove), Compare, and Go to store.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Store, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductOffer, RetailerId } from "@/lib/types";
import { storeOutboundHref } from "@/lib/affiliate/outbound";
import { formatPrice } from "@/lib/utils/format";
import { ProductImage } from "@/components/ProductImage";

interface Props {
  offers: ProductOffer[];
  onRemove: (id: string) => void;
}

const compareHref = (o: ProductOffer) =>
  o.catalogId ? `/compare?product=${encodeURIComponent(o.catalogId)}` : `/chat?q=${encodeURIComponent(`${o.brand} ${o.title}`)}`;
const storeHref = (o: ProductOffer) =>
  storeOutboundHref(o.retailer as RetailerId, o.productUrl || undefined, o.affiliateUrl, {
    offerId: o.id,
    catalogId: o.catalogId,
    source: "card",
  });

export function SavedProductsList({ offers, onRemove }: Props) {
  // ── Desktop horizontal-scroll state ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [offers.length]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 280), behavior: "smooth" });
  };

  return (
    <>
      {/* ── Mobile: P2 list rows in a fixed-height vertical-scroll pane ── */}
      <div className="lg:hidden">
        <div className="max-h-[68vh] space-y-2 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
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
      </div>

      {/* ── Desktop: two-row grid; fills both rows then scrolls horizontally ── */}
      <div className="relative hidden lg:block">
        {canLeft && (
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label="Scroll left"
            className="absolute -left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-stone-200 bg-white p-2 text-stone-700 shadow-md hover:bg-stone-50"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {canRight && (
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label="Scroll right"
            className="absolute -right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-stone-200 bg-white p-2 text-stone-700 shadow-md hover:bg-stone-50"
          >
            <ChevronRight size={20} />
          </button>
        )}
        <div
          ref={scrollRef}
          className="grid grid-flow-col grid-rows-2 auto-cols-[16rem] gap-4 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [scrollbar-width:thin]"
        >
          {offers.map((o) => {
            const dest = storeHref(o);
            return (
              <article key={o.id} className="flex w-64 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white">
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
                    {dest && <a href={dest} target="_blank" rel="noopener noreferrer sponsored" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-200 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50"><Store size={14} /> Go to store</a>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
