import Link from "next/link";
import { Columns3 } from "lucide-react";
import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";
import { ProductImage } from "@/components/ProductImage";
import { formatPrice } from "@/lib/utils/format";
import { getRetailerMeta } from "@/lib/retailers/meta";

export function CanonicalProductCard({ product }: { product: CanonicalProduct }) {
  const lowest = product.offers[0];
  const storeCount = product.offers.length;
  const inStockCount = product.offers.filter((o) => o.availability === "in_stock").length;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/inventory/products/${encodeURIComponent(product.canonical_id)}`} className="block">
        <div className="relative aspect-square bg-cream-50">
          <ProductImage
            src={product.canonical_image}
            alt={product.canonical_title}
            className="h-full w-full object-contain p-4"
            retailerId={lowest?.retailer}
          />
          <span className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold text-ink-700 shadow-sm">
            {product.canonical_category}
          </span>
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {product.brand && (
          <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
            {product.brand}
          </p>
        )}
        <Link href={`/inventory/products/${encodeURIComponent(product.canonical_id)}`}>
          <h3 className="line-clamp-2 text-sm font-bold text-ink-900 hover:text-sage-800">
            {product.canonical_title}
          </h3>
        </Link>
        {lowest && (
          <p className="text-lg font-bold text-ink-900">
            from {formatPrice(lowest.price)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {product.offers.slice(0, 5).map((o) => {
            const meta = getRetailerMeta(o.retailer);
            return (
              <span
                key={o.retailer}
                title={meta.name}
                className="inline-flex items-center gap-1 rounded-full border border-cream-200 bg-cream-50 px-2 py-0.5 text-[10px] font-semibold text-ink-600"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden
                />
                {meta.shortName}
              </span>
            );
          })}
        </div>
        <p className="text-xs text-ink-500">
          Multi-store pricing · {inStockCount} in stock · {storeCount} retailer
          {storeCount === 1 ? "" : "s"}
        </p>
        <Link
          href={`/inventory/products/${encodeURIComponent(product.canonical_id)}`}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-sage-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sage-800"
        >
          <Columns3 size={16} />
          Compare pricing
        </Link>
      </div>
    </article>
  );
}
