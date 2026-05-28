"use client";

import type { ProductOffer } from "@/lib/types";
import { ProductCard } from "./ProductCard";

const MAX_VISIBLE = 15;
const PER_ROW = 5;
/** Cards visible before horizontal scroll within each row */
const VISIBLE_PER_ROW = 3;

interface ProductGridProps {
  products: ProductOffer[];
  savedIds: Set<string>;
  onSave: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
}

export function ProductGrid({
  products,
  savedIds,
  onSave,
  onShopClick,
}: ProductGridProps) {
  if (!products.length) return null;

  const visible = products.slice(0, MAX_VISIBLE);
  const rows: ProductOffer[][] = [];
  for (let i = 0; i < visible.length; i += PER_ROW) {
    rows.push(visible.slice(i, i + PER_ROW));
  }

  return (
    <div className="mt-2 space-y-3">
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin [scrollbar-width:thin]"
          style={{
            scrollSnapType: "x proximity",
          }}
        >
          <div className="flex w-max min-w-full gap-3">
            {row.map((offer) => (
              <div
                key={offer.id}
                className="w-[10.5rem] shrink-0 snap-start sm:w-44"
              >
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
        </div>
      ))}
      {products.length > MAX_VISIBLE && (
        <p className="pt-1 text-center text-xs text-stone-500">
          Showing {MAX_VISIBLE} of {products.length} stores — best prices first.
        </p>
      )}
      {visible.some((_, i) => i % PER_ROW >= VISIBLE_PER_ROW) && (
        <p className="text-center text-[11px] text-stone-400">
          Scroll sideways in each row to see up to {PER_ROW} stores.
        </p>
      )}
    </div>
  );
}
