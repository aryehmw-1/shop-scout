"use client";

import { Sparkles } from "lucide-react";
import type { ProductOffer, SimilarProduct } from "@/lib/types";
import { MobileOfferList } from "./MobileOfferList";
import { DesktopOfferListB } from "./OfferListB";

interface Props {
  similar: SimilarProduct[];
  /** Exact-match offers already shown (to honor the 7-card cap). */
  exactCount: number;
  searchQuery?: string;
}

/** Build a ProductOffer so similar items render through the SAME card components
 *  as exact results — identical layout, just badged "Similar" (no Best, no
 *  price-comparison pills). */
function similarToOffer(s: SimilarProduct): ProductOffer {
  return {
    id: `similar-${s.catalogId}`,
    title: s.title,
    brand: s.brand,
    size: "",
    catalogId: s.catalogId,
    imageUrl: s.imageUrl,
    retailer: s.retailer,
    retailerName: s.retailerName,
    channel: "online",
    price: s.price,
    unitPrice: s.price,
    unitLabel: "each",
    inStock: true,
    pickupAvailable: false,
    landedCost: s.price,
    deliveredTotal: s.price,
    productUrl: s.productUrl,
    affiliateUrl: s.affiliateUrl ?? "",
    matchConfidence: 0.5,
    matchBand: "similar",
  };
}

/**
 * Similar alternatives — different products, rendered in the SAME card format as
 * exact results (cheapest first), each badged "Similar". A single clear banner
 * (mirroring the "Verified live prices" strip) separates them from the exact
 * offers above.
 */
export function SimilarAlternatives({ similar, exactCount, searchQuery }: Props) {
  if (!similar.length) return null;
  const cap = Math.max(0, 7 - exactCount);
  const offers = similar
    .map(similarToOffer)
    .sort((a, b) => a.price - b.price)
    .slice(0, cap);
  if (!offers.length) return null;

  return (
    <section className="mt-3 space-y-2">
      <div className="flex w-full items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-[12px] font-semibold text-stone-700 ring-1 ring-stone-200">
        <Sparkles size={14} className="shrink-0 text-stone-500" aria-hidden />
        <span>
          Similar alternatives
          <span className="font-normal text-stone-500">
            {" "}— close options, not the exact item
            {exactCount === 0 ? " we could find" : " you searched"}
          </span>
        </span>
      </div>
      <div className="hidden lg:block">
        <DesktopOfferListB offers={offers} searchQuery={searchQuery} variant="similar" />
      </div>
      <div className="lg:hidden">
        <MobileOfferList offers={offers} searchQuery={searchQuery} variant="similar" />
      </div>
    </section>
  );
}
