import Link from "next/link";
import { getVerifiedFirstCategories } from "@/lib/inventory/category-coverage";

const TIER_STYLES = {
  production: "bg-sage-100 text-sage-800 ring-sage-200",
  indexed: "bg-blue-50 text-blue-800 ring-blue-200",
  experimental: "bg-amber-50 text-amber-800 ring-amber-200",
  catalog_only: "bg-stone-100 text-stone-600 ring-stone-200",
} as const;

export function CategoryGrid() {
  const categories = getVerifiedFirstCategories();

  return (
    <section className="px-4 py-14 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-homy text-2xl font-bold text-ink-900">
          Start with inventory categories
        </h2>
        <p className="mt-2 text-ink-600">
          Grocery and household first — apparel marked experimental until live
          retailer coverage improves
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/chat?start=${cat.id}`}
              className="group relative overflow-hidden rounded-2xl bg-cream-50 p-6 text-center shadow-sm ring-1 ring-orange-100/80 transition hover:shadow-md hover:ring-orange-300/70"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-50/0 to-rose-50/0 opacity-0 transition group-hover:opacity-100 group-hover:from-orange-50 group-hover:to-amber-50/80" />
              <span
                className={`relative inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${TIER_STYLES[cat.tier]}`}
              >
                {cat.badge}
              </span>
              <span className="relative mt-2 block text-4xl transition group-hover:scale-110">
                {cat.emoji}
              </span>
              <span className="relative mt-3 block text-sm font-semibold text-ink-800">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-ink-500">
          <Link href="/inventory" className="font-semibold text-sage-700 hover:underline">
            Browse inventory →
          </Link>
        </p>
      </div>
    </section>
  );
}
