"use client";

import type { ProductOffer } from "@/lib/types";
import { DISPLAY_OFFER_LIMIT } from "@/lib/offers/offer-ranking";
import { ProductCard } from "./ProductCard";

const PER_ROW = 5;

interface ProductGridProps {
  products: ProductOffer[];
  savedIds: Set<string>;
  onSave: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  layout?: "grid" | "carousel";
}

export function ProductGrid({
  products,
  savedIds,
  onSave,
  onShopClick,
}: ProductGridProps) {
  if (!products.length) return null;

  const visible = products.slice(0, DISPLAY_OFFER_LIMIT);
  const rows: ProductOffer[][] = [];
  for (let i = 0; i < visible.length; i += PER_ROW) {
    rows.push(visible.slice(i, i + PER_ROW));
  }

  return (
    <div className="mt-2 space-y-4">
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4"
        >
          {row.map((offer) => (
            <div key={offer.id} className="min-w-0">
              <ProductCard
                offer={offer}
                layout="grid"
                onSave={() => onSave(offer)}
                onShopClick={onShopClick}
                saved={savedIds.has(offer.id)}
              />
            </div>
          ))}
        </div>
      ))}
      {products.length > DISPLAY_OFFER_LIMIT && (
        <p className="pt-1 text-center text-xs text-stone-500">
          Showing top {DISPLAY_OFFER_LIMIT} verified-ranked offers of{" "}
          {products.length} — quality over quantity.
        </p>
      )}
    </div>
  );
}
