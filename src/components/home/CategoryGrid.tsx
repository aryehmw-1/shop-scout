import Link from "next/link";
import { getPopularCategories } from "@/lib/retailers/catalog";

export function CategoryGrid() {
  const categories = getPopularCategories();

  return (
    <section className="px-4 py-14 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-homy text-2xl font-bold text-ink-900">
          Start with a category
        </h2>
        <p className="mt-2 text-ink-600">One tap opens compare with a ready-made search</p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/chat?start=${cat.id}`}
              className="group relative overflow-hidden rounded-2xl bg-cream-50 p-6 text-center shadow-sm ring-1 ring-orange-100/80 transition hover:shadow-md hover:ring-orange-300/70"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-50/0 to-rose-50/0 opacity-0 transition group-hover:opacity-100 group-hover:from-orange-50 group-hover:to-amber-50/80" />
              <span className="relative text-4xl transition group-hover:scale-110">
                {cat.emoji}
              </span>
              <span className="relative mt-3 block text-sm font-semibold text-ink-800">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
