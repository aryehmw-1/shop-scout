"use client";

import type { ProductOffer } from "@/lib/types";
import { getOfferPriceDisplay } from "@/lib/shopping/offer-price-display";
import { formatPrice } from "@/lib/utils/format";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { ExternalLink, Heart } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { PhotoSourceLabel } from "./PhotoSourceLabel";

interface ProductCardProps {
  offer: ProductOffer;
  onSave?: (id: string) => void;
  onShopClick?: (offer: ProductOffer) => void;
  saved?: boolean;
  /** grid = full width in a multi-column row; carousel = fixed width scroll strip */
  layout?: "grid" | "carousel";
}

export function ProductCard({
  offer,
  onSave,
  onShopClick,
  saved,
  layout = "carousel",
}: ProductCardProps) {
  const meta = getRetailerMeta(offer.retailer);
  const priceDisplay = getOfferPriceDisplay(offer);

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
        layout === "grid" ? "w-full min-w-0" : "w-[240px] shrink-0"
      }`}
    >
      <div className="relative aspect-square bg-gradient-to-br from-stone-100 to-stone-50">
        <ProductImage
          src={offer.imageUrl}
          alt={offer.storeTitle ?? `${offer.brand} ${offer.title}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {offer.isBestDeal && (
          <span className="absolute left-2 top-2 rounded-full bg-sage-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            Best deal
          </span>
        )}
        {offer.savingsPercent && offer.savingsPercent > 0 && !offer.isBestDeal && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            -{offer.savingsPercent}%
          </span>
        )}
        {!offer.inStock && (
          <span className="absolute inset-0 flex items-center justify-center bg-stone-900/40 text-sm font-medium text-white">
            Low stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-bold text-white"
            style={{ backgroundColor: meta.color }}
          >
            {meta.shortName.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-xs font-semibold text-stone-500">
            {offer.retailerName}
          </span>
        </div>

        <h3
          className={`line-clamp-3 font-semibold leading-snug text-stone-800 ${
            layout === "grid" ? "text-xs sm:text-sm" : "text-sm"
          }`}
        >
          {offer.storeTitle ?? `${offer.brand} ${offer.title}`}
        </h3>
        <PhotoSourceLabel source={offer.imageSource} className="mt-0.5" />
        <p className="text-xs text-stone-500">
          {offer.brand} · {offer.size}
        </p>

        <div className="mt-auto flex items-baseline gap-2">
          <p
            className={`font-bold text-stone-900 ${
              priceDisplay.main === "See store" ? "text-lg" : "text-2xl"
            }`}
          >
            {priceDisplay.main}
          </p>
          {priceDisplay.showWasPrice && offer.wasPrice && offer.wasPrice > offer.price && (
            <p className="text-sm text-stone-400 line-through">
              {formatPrice(offer.wasPrice)}
            </p>
          )}
        </div>
        <p className="text-[11px] leading-snug text-stone-500">{priceDisplay.sub}</p>
        {priceDisplay.main !== "See store" && (
          <p className="text-xs text-stone-400">
            {formatPrice(offer.unitPrice)}/{offer.unitLabel}
            {offer.deliveryFee ? ` · +${formatPrice(offer.deliveryFee)} del.` : ""}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <a
            href={offer.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => onShopClick?.(offer)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sage-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sage-700"
          >
            View deal
            <ExternalLink size={14} />
          </a>
          {onSave && (
            <button
              type="button"
              onClick={() => onSave(offer.id)}
              className={`rounded-xl border px-3 py-2 transition ${
                saved
                  ? "border-red-200 bg-red-50 text-red-500"
                  : "border-stone-200 text-stone-400 hover:border-stone-300 hover:text-red-400"
              }`}
              aria-label={saved ? "Unsave" : "Save deal"}
            >
              <Heart size={18} fill={saved ? "currentColor" : "none"} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
