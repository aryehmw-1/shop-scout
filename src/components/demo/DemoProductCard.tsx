import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-commerce/types";
import { buildDemoOutboundUrl } from "@/lib/demo-commerce/outbound";
import { formatPrice } from "@/lib/utils/format";
import { ProductImage } from "@/components/ProductImage";

export function DemoProductCard({ product }: { product: DemoProduct }) {
  const outbound = buildDemoOutboundUrl(product);
  const invalid = product.link_valid === false;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
        invalid ? "border-amber-300 opacity-80" : "border-cream-200"
      }`}
    >
      <Link href={`/inventory/products/${encodeURIComponent(product.id)}`} className="block">
        <div className="relative aspect-square bg-cream-100">
          {product.image_url ?
            <ProductImage
              src={product.image_url}
              alt={product.title}
              className="h-full w-full object-contain p-4"
            />
          : (
            <div className="flex h-full items-center justify-center text-xs text-ink-400">
              No image
            </div>
          )}
          {invalid && (
            <span className="absolute left-2 top-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Link flagged
            </span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
          {product.retailer}
        </p>
        <Link href={`/inventory/products/${encodeURIComponent(product.id)}`}>
          <h3 className="line-clamp-2 text-sm font-bold text-ink-900 hover:text-sage-800">
            {product.title}
          </h3>
        </Link>
        {product.price != null && (
          <p className="text-lg font-bold text-ink-900">
            {formatPrice(product.price)}
          </p>
        )}
        {product.category && (
          <p className="text-xs text-ink-500">{product.category}</p>
        )}
        <a
          href={outbound}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sage-800"
        >
          View Product
          <ExternalLink size={16} />
        </a>
      </div>
    </article>
  );
}
