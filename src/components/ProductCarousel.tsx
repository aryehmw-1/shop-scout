"use client";

import type { ProductOffer } from "@/lib/types";
import { ProductCard } from "./ProductCard";

interface ProductCarouselProps {
  products: ProductOffer[];
  savedIds: Set<string>;
  onSave: (id: string) => void;
  onShopClick?: (offer: ProductOffer) => void;
}

export function ProductCarousel({
  products,
  savedIds,
  onSave,
  onShopClick,
}: ProductCarouselProps) {
  if (!products.length) return null;

  return (
    <div className="mt-1 min-w-0 -mx-1">
      <div className="flex gap-3 overflow-x-auto pb-2 px-1 snap-x snap-mandatory scrollbar-thin [scrollbar-width:thin]">
        {products.map((offer) => (
          <div key={offer.id} className="snap-start">
            <ProductCard
              offer={offer}
              onSave={onSave}
              onShopClick={onShopClick}
              saved={savedIds.has(offer.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
