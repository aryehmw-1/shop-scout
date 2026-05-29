import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { APP_NAME } from "@/lib/constants";
import { CONTACT_EMAIL, getSiteUrl } from "@/lib/site";
import { SHOPPABLE_STORE_COUNT } from "@/lib/retailers/meta";

export const metadata: Metadata = {
  title: "About",
  description: `${APP_NAME} helps shoppers compare online prices across major retailers.`,
};

export default function AboutPage() {
  const siteUrl = getSiteUrl();

  return (
    <AppShell>
      <article className="mx-auto max-w-2xl flex-1 px-6 py-12 lg:px-12">
        <h1 className="font-homy text-3xl font-bold text-ink-900">About {APP_NAME}</h1>
        <p className="mt-2 text-sm text-ink-500">{siteUrl}</p>

        <div className="mt-8 space-y-6 text-ink-600 leading-relaxed">
          <p>
            <strong className="text-ink-800">{APP_NAME}</strong> is a price-comparison
            service for everyday shopping. We help you see how a product stacks up across
            major retailers online — your ZIP is used only for shipping estimates —
            so you can buy with confidence.
          </p>

          <h2 className="text-xl font-semibold text-ink-900">What we offer</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              A free <Link href="/chat" className="text-orange-700 underline">compare tool</Link>{" "}
              — describe what you need or paste a product link.
            </li>
            <li>
              Side-by-side prices from {SHOPPABLE_STORE_COUNT}+ retailers (groceries,
              clothing, shoes, home, kids, and more).
            </li>
            <li>
              Links to each store&apos;s website so you can complete your purchase
              directly with the retailer.
            </li>
            <li>
              A browser extension (optional) to compare while you shop on supported
              store sites.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-ink-900">How we make money</h2>
          <p>
            {APP_NAME} may earn a commission when you click through to a retailer and
            make a qualifying purchase, including through the{" "}
            <strong>Amazon Associates Program</strong>. This does not change the price
            you pay. See our{" "}
            <Link href="/affiliate-disclosure" className="text-orange-700 underline">
              affiliate disclosure
            </Link>{" "}
            for details.
          </p>

          <h2 className="text-xl font-semibold text-ink-900">Accuracy</h2>
          <p>
            Prices and availability change frequently. We show estimates, cached
            prices, or live data when available from official retailer sources. Always
            confirm the final price on the retailer&apos;s checkout page before you buy.
          </p>

          <h2 className="text-xl font-semibold text-ink-900">Contact</h2>
          <p>
            Questions or partnership inquiries:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-700 underline">
              {CONTACT_EMAIL}
            </a>
            . See also our <Link href="/contact" className="text-orange-700 underline">contact page</Link>.
          </p>
        </div>
      </article>
      <Footer />
    </AppShell>
  );
}
