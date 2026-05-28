"use client";

import type { ProductOffer } from "@/lib/types";
import { formatPrice } from "@/lib/utils/format";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { ExternalLink, Trophy } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { PhotoSourceLabel } from "./PhotoSourceLabel";

interface CompareTableProps {
  products: ProductOffer[];
  onSave?: (offer: ProductOffer) => void;
  savedIds: Set<string>;
}

export function CompareTable({ products, onSave, savedIds }: CompareTableProps) {
  if (!products.length) return null;

  const hero = products[0];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-sage-200 bg-sage-50/80 p-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
          <ProductImage
            src={hero.imageUrl}
            alt={`${hero.brand} ${hero.title}`}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-stone-800">
            {hero.storeTitle ?? `${hero.brand} ${hero.title}`}
          </p>
          <PhotoSourceLabel source={hero.imageSource} />
          <p className="text-sm text-stone-500">{hero.size}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80 text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                Per unit
              </th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((offer) => {
              const meta = getRetailerMeta(offer.retailer);
              return (
                <tr
                  key={offer.id}
                  className={`border-b border-stone-50 last:border-0 ${
                    offer.isBestDeal ? "bg-sage-50/50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                        style={{ backgroundColor: meta.color }}
                      >
                        {meta.shortName.slice(0, 2)}
                      </span>
                      <div>
                        <p className="font-medium text-stone-800">
                          {offer.retailerName}
                        </p>
                        {offer.isBestDeal && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-sage-700">
                            <Trophy size={12} /> Best price
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-lg font-bold text-stone-900">
                      {formatPrice(offer.price)}
                    </p>
                    {offer.wasPrice && offer.wasPrice > offer.price && (
                      <p className="text-xs text-stone-400 line-through">
                        {formatPrice(offer.wasPrice)}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-stone-600 sm:table-cell">
                    {formatPrice(offer.unitPrice)}/{offer.unitLabel}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onSave && (
                        <button
                          type="button"
                          onClick={() => onSave(offer)}
                          className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-red-500"
                          aria-label="Save"
                        >
                          {savedIds.has(offer.id) ? "♥" : "♡"}
                        </button>
                      )}
                      <a
                        href={offer.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="inline-flex items-center gap-1 rounded-xl bg-sage-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sage-700"
                      >
                        Shop
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
