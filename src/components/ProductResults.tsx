"use client";

import { useState } from "react";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import { cheapestVerifiedPrice } from "@/lib/search/price-truth";
import { formatPrice } from "@/lib/utils/format";
import { ProductGrid } from "./ProductGrid";
import { CompareTable } from "./CompareTable";
import { ProductImage } from "./ProductImage";
import { PhotoSourceLabel } from "./PhotoSourceLabel";
import { LayoutGrid, List, MapPin, Truck } from "lucide-react";

interface ProductResultsProps {
  results: ProductSearchResults;
  savedIds: Set<string>;
  onSave: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
}

export function ProductResults({
  results,
  savedIds,
  onSave,
  onShopClick,
}: ProductResultsProps) {
  const { local, online, zipCode, compareMode, referenceProduct, similarMode } =
    results;
  const [view, setView] = useState<"cards" | "table">(
    compareMode ? "table" : "cards",
  );

  if (!local.length && !online.length) return null;

  const ViewToggle = () => (
    <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
      <button
        type="button"
        onClick={() => setView("cards")}
        className={`rounded-md p-1.5 transition ${
          view === "cards"
            ? "bg-sage-100 text-sage-800"
            : "text-stone-400 hover:text-stone-600"
        }`}
        aria-label="Card view"
      >
        <LayoutGrid size={16} />
      </button>
      <button
        type="button"
        onClick={() => setView("table")}
        className={`rounded-md p-1.5 transition ${
          view === "table"
            ? "bg-sage-100 text-sage-800"
            : "text-stone-400 hover:text-stone-600"
        }`}
        aria-label="Table view"
      >
        <List size={16} />
      </button>
    </div>
  );

  const ResultColumn = ({
    title,
    subtitle,
    icon: Icon,
    products,
    accentClass,
    emptyMessage,
  }: {
    title: string;
    subtitle: string;
    icon: typeof MapPin;
    products: ProductOffer[];
    accentClass: string;
    emptyMessage: string;
  }) => (
    <section
      className={`flex min-h-[16rem] min-w-0 flex-1 flex-col rounded-2xl border-2 p-4 sm:min-h-[20rem] sm:p-5 ${accentClass}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
            <Icon size={22} className="text-sage-700" />
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-bold text-stone-900 sm:text-lg">{title}</h4>
            <p className="mt-0.5 text-xs text-stone-600 sm:text-sm">{subtitle}</p>
          </div>
        </div>
        {compareMode && products.length > 1 && <ViewToggle />}
      </div>

      {products.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-3 py-12 text-center text-sm text-stone-500">
          {emptyMessage}
        </p>
      ) : view === "table" ? (
        <CompareTable products={products} savedIds={savedIds} onSave={onSave} />
      ) : (
        <ProductGrid
          products={products}
          savedIds={savedIds}
          onSave={onSave}
          onShopClick={onShopClick}
        />
      )}
    </section>
  );

  const matched = results.matchedProduct;
  const verifiedFrom = cheapestVerifiedPrice(results);

  return (
    <div className="mt-4 w-full max-w-full space-y-4">
      {matched && !similarMode && (
        <div className="flex gap-4 rounded-2xl border border-orange-200/80 bg-cream-50/90 p-4 sm:p-5">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm sm:h-28 sm:w-28">
            <ProductImage
              src={matched.imageUrl}
              alt={matched.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Showing prices for
            </p>
            <h3 className="font-homy mt-0.5 text-lg font-bold leading-snug text-ink-900 sm:text-xl">
              {matched.title}
            </h3>
            <PhotoSourceLabel source={matched.imageSource} className="mt-1" />
            <p className="text-sm text-ink-500">{matched.brand}</p>
            {(verifiedFrom ?? matched.fromPrice) != null && (
              <p className="mt-1 text-sm font-semibold text-sage-700">
                {verifiedFrom != null
                  ? `From ${formatPrice(verifiedFrom)} (verified live prices)`
                  : `About ${formatPrice(matched.fromPrice!)} — estimated across stores`}
              </p>
            )}
          </div>
        </div>
      )}

      {similarMode && referenceProduct && (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          <p>
            <span className="font-medium text-stone-800">From your link:</span>{" "}
            {referenceProduct.title}
            <span className="text-stone-400">
              {" "}
              · about ${referenceProduct.referencePrice.toFixed(2)}
            </span>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Similar products below — sorted by price. Look for{" "}
            <span className="font-medium text-sage-700">Save % vs link</span>{" "}
            tags.
          </p>
        </div>
      )}

      {!compareMode && (
        <div className="flex items-center justify-end">
          <ViewToggle />
        </div>
      )}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <ResultColumn
          title={
            similarMode
              ? `Closest to you (${Math.min(local.length, 15)}${local.length > 15 ? "+" : ""})`
              : `Closest to you (${Math.min(local.length, 15)}${local.length > 15 ? "+" : ""})`
          }
          subtitle={`${local.length} stores near ZIP ${zipCode} · up to 15 shown · 5 per row`}
          icon={MapPin}
          products={local}
          accentClass="border-sage-300/90 bg-sage-50/50"
          emptyMessage="No nearby store matches for this search yet."
        />

        <ResultColumn
          title={
            similarMode
              ? `Online shopping (${Math.min(online.length, 15)}${online.length > 15 ? "+" : ""})`
              : `Online shopping (${Math.min(online.length, 15)}${online.length > 15 ? "+" : ""})`
          }
          subtitle={`${online.length} online stores · ships to ${zipCode} · 5 per row`}
          icon={Truck}
          products={online}
          accentClass="border-amber-300/80 bg-amber-50/40"
          emptyMessage="No online store matches for this search yet."
        />
      </div>
    </div>
  );
}
