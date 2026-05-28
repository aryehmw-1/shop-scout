import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { APP_NAME } from "@/lib/constants";
import { CONTACT_EMAIL, getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `Terms of use for ${APP_NAME} price comparison service.`,
};

export default function TermsPage() {
  const updated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const siteUrl = getSiteUrl();

  return (
    <LegalLayout title="Terms of Use">
      <p>
        <strong>Last updated:</strong> {updated}
      </p>
      <p>
        By using {APP_NAME} at{" "}
        <a href={siteUrl} className="text-orange-700 underline">
          {siteUrl}
        </a>
        , you agree to these terms.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Service description</h2>
      <p>
        {APP_NAME} provides price comparisons and links to third-party retailers for
        informational purposes. We are not a retailer and do not sell products.
        Purchases are made directly with each store.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Pricing accuracy</h2>
      <p>
        Prices shown may be estimates, cached values, or live data when available.
        Always verify price, tax, shipping, and availability on the retailer&apos;s
        website before purchasing.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Affiliate relationships</h2>
      <p>
        We may receive compensation when you use our links to shop. See our{" "}
        <Link href="/affiliate-disclosure" className="text-orange-700 underline">
          Affiliate Disclosure
        </Link>
        .
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Disclaimer</h2>
      <p>
        The service is provided &quot;as is&quot; without warranties. We are not liable
        for decisions you make based on comparison results or for issues arising from
        third-party retailers.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-700 underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </LegalLayout>
  );
}
