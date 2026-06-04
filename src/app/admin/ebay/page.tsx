import Link from "next/link";
import { ebayProvider, isEbayConfigured } from "@/lib/product-data/ebay";
import { safeProductProviderReason } from "@/lib/product-data/http";

export const dynamic = "force-dynamic";

interface AdminEbayPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminEbayPage({ searchParams }: AdminEbayPageProps) {
  const params = (await searchParams) ?? {};
  const query = firstParam(params.q).trim();
  const configured = isEbayConfigured();
  let products: Awaited<ReturnType<typeof ebayProvider.searchProducts>> = [];
  let error: string | null = null;

  if (query && configured) {
    try {
      products = await ebayProvider.searchProducts(query);
    } catch (e) {
      error = safeProductProviderReason(e);
    }
  }

  return (
    <main className="min-h-screen bg-cream-100 px-6 py-8 text-stone-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-800">
            Admin debug
          </p>
          <h1 className="mt-1 text-3xl font-bold">eBay retrieval test</h1>
          <p className="mt-2 text-sm text-stone-600">
            Server-side Browse API search. Credentials stay on the server.
          </p>
        </div>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`rounded-full px-2.5 py-1 font-semibold ${
                configured ? "bg-sage-50 text-sage-800" : "bg-amber-50 text-amber-800"
              }`}
            >
              {configured ? "Configured" : "Missing credentials"}
            </span>
            <Link
              href={`/api/test/ebay?q=${encodeURIComponent(query || "cheerios")}`}
              className="font-semibold text-sage-800 underline underline-offset-2"
            >
              Open JSON test route
            </Link>
          </div>

          <form action="/admin/ebay" className="flex gap-2">
            <label htmlFor="ebay-q" className="sr-only">
              eBay search query
            </label>
            <input
              id="ebay-q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="cheerios"
              className="min-w-0 flex-1 rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
            />
            <button
              type="submit"
              className="rounded-xl bg-stone-950 px-5 py-3 text-sm font-bold text-white hover:bg-stone-800"
            >
              Search
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              eBay request failed: {error}
            </p>
          )}
        </section>

        {query && !error && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const offer = product.offers[0];
              return (
                <article
                  key={product.providerProductId}
                  className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
                >
                  <div className="aspect-square bg-stone-50">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="h-full w-full object-contain p-4"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="line-clamp-2 font-bold text-stone-950">
                      {product.title}
                    </p>
                    <p className="text-sm text-stone-500">
                      {product.brand ?? "Unknown brand"}
                    </p>
                    {offer && (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-lg font-black text-stone-950">
                          ${offer.price.toFixed(2)}
                        </p>
                        <a
                          href={offer.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl bg-sage-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sage-800"
                        >
                          View
                        </a>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
