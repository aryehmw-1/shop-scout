import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { StoreDirectory } from "@/components/home/StoreDirectory";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { Logo } from "@/components/Logo";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <AppShell>
      <main className="min-w-0 flex-1">
        <div className="border-b border-orange-100/80 bg-cream-50/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <Logo />
        </div>

        <Hero />
        <StoreDirectory />
        <HowItWorks />
        <CategoryGrid />

        <section className="relative mx-4 mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-950 via-orange-900 to-rose-900 px-6 py-12 text-center text-white shadow-2xl shadow-orange-900/20 sm:mx-6 sm:px-8 sm:py-14 lg:mx-12 lg:mb-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,237,213,0.15),transparent_55%)]" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="font-homy text-2xl font-bold md:text-3xl">
              Your whole list. One compare.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-orange-100/90">
              Groceries, sneakers, nursery gear, patio furniture — if major stores sell
              it, we compare online prices for you.
            </p>
            <Link
              href="/chat"
              className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 font-semibold text-orange-900 shadow-lg transition hover:bg-orange-50"
            >
              Compare prices now
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        <Footer />
      </main>
    </AppShell>
  );
}
