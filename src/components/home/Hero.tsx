import Link from "next/link";
import { ArrowRight, MapPin, Link2, Home } from "lucide-react";
import { SHOPPABLE_STORE_COUNT } from "@/lib/retailers/meta";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-12 lg:pb-24 lg:pt-16">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 top-0 h-[28rem] w-[28rem] rounded-full bg-orange-300/25 blur-3xl" />
        <div className="absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute right-1/3 top-1/2 h-64 w-64 rounded-full bg-rose-200/25 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-200/90 bg-cream-50/90 px-4 py-1.5 text-sm font-medium text-sage-800 shadow-sm backdrop-blur-sm">
            <Home size={14} className="text-sage-600" />
            Compare prices across {SHOPPABLE_STORE_COUNT} stores
          </span>

          <h1 className="font-homy mt-6 text-3xl font-bold leading-tight tracking-tight text-ink-900 sm:text-4xl md:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
            Find the lowest price on{" "}
            <span className="text-gradient-hero">anything you buy</span>
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-600">
            Pull up a chair — we&apos;ll check online stores for you. Groceries,
            clothes, home, and kids — compare prices that{" "}
            <strong className="text-ink-800">ship to your ZIP</strong>, like a neighbor who
            loves a good deal.
          </p>

          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href="/chat"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-orange-500/30 transition hover:from-orange-600 hover:via-amber-600 hover:to-orange-700 hover:shadow-2xl sm:w-auto"
            >
              Compare prices now
              <ArrowRight size={20} />
            </Link>
            <Link
              href="/chat?hint=link"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-200/80 bg-cream-50/95 px-6 py-3.5 text-base font-semibold text-ink-700 shadow-sm backdrop-blur-sm transition hover:border-orange-300 hover:bg-orange-50 sm:w-auto"
            >
              <Link2 size={18} className="text-ink-400" />
              I have a product link
            </Link>
          </div>

          <p className="mt-3 text-sm text-ink-500">
            Both open the same chat — type what you need or paste a store product URL.
          </p>

          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} className="text-sage-600" />
              Online prices · ZIP for shipping
            </span>
            <span className="text-ink-300">·</span>
            <span>No account required to try</span>
          </p>
        </div>

        <div className="mx-auto w-full max-w-md lg:max-w-none">
          <div className="glass-card rounded-3xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Live compare preview
            </p>
            <p className="mt-2 font-display text-xl font-bold text-ink-900">
              Men&apos;s running shoes
            </p>
            <div className="mt-4 space-y-3">
              {[
                { name: "Amazon", price: "$74.99", tag: "Online", best: true },
                { name: "Nike.com", price: "$89.97", tag: "Online", best: false },
                { name: "Foot Locker", price: "$79.99", tag: "Online", best: false },
              ].map((row) => (
                <div
                  key={row.name}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    row.best
                      ? "bg-orange-50 ring-2 ring-orange-400/35"
                      : "bg-cream-100/90"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-ink-800">{row.name}</p>
                    <p className="text-[11px] text-ink-500">{row.tag}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-ink-900">{row.price}</p>
                    {row.best && (
                      <p className="text-[10px] font-semibold uppercase text-sage-700">
                        Best deal
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
