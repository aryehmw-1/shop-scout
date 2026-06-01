import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { queryCanonicalCatalog, hasCanonicalCatalog } from "@/lib/demo-commerce/canonical/store";
import { queryDemoCatalog } from "@/lib/demo-commerce/store";
import {
  filterPublicCanonicalCatalog,
  filterPublicDemoCatalog,
} from "@/lib/retailers/public-retailers";
import { CanonicalProductCard } from "@/components/demo/CanonicalProductCard";
import { DemoProductCard } from "@/components/demo/DemoProductCard";

export function FeaturedProducts() {
  if (hasCanonicalCatalog()) {
    const catalog = filterPublicCanonicalCatalog(queryCanonicalCatalog());
    const featured = catalog.products.slice(0, 8);
    if (!featured.length) return null;

    return (
      <section className="px-4 py-12 sm:px-6 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-homy text-2xl font-bold text-ink-900 sm:text-3xl">
                Compare across stores
              </h2>
              <p className="mt-2 text-ink-600">
                Same product, verified images — prices at {catalog.retailers.length} retailers.
              </p>
            </div>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 text-sm font-semibold text-sage-700 hover:text-sage-900"
            >
              Browse all ({catalog.total})
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p) => (
              <CanonicalProductCard key={p.canonical_id} product={p} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const catalog = filterPublicDemoCatalog(queryDemoCatalog({ validOnly: true }));
  const featured = [...catalog.products]
    .filter((p) => p.price != null)
    .slice(0, 8);

  if (!featured.length) return null;

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-homy text-2xl font-bold text-ink-900 sm:text-3xl">
              Featured products
            </h2>
            <p className="mt-2 text-ink-600">Browse our product catalog.</p>
          </div>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 text-sm font-semibold text-sage-700 hover:text-sage-900"
          >
            Browse catalog
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => (
            <DemoProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
