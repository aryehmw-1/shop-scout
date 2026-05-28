import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { APP_NAME } from "@/lib/constants";
import { CONTACT_EMAIL, getSiteUrl, SITE_LEGAL_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy policy for ${APP_NAME} — how we handle your data and affiliate links.`,
};

export default function PrivacyPage() {
  const updated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const siteUrl = getSiteUrl();

  return (
    <LegalLayout title="Privacy Policy">
      <p>
        <strong>Last updated:</strong> {updated}
      </p>
      <p>
        {SITE_LEGAL_NAME} (&quot;{APP_NAME},&quot; &quot;we,&quot; &quot;us&quot;) operates{" "}
        <a href={siteUrl} className="text-orange-700 underline">
          {siteUrl}
        </a>
        , a price-comparison website and related services. This policy explains what
        information we collect and how we use it.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Information we collect</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Account data</strong> (optional): email and name if you create an
          account; password stored as a secure hash.
        </li>
        <li>
          <strong>Shopping preferences</strong>: ZIP code, saved deals, and search
          queries you enter in the compare tool.
        </li>
        <li>
          <strong>Technical data</strong>: standard server logs (IP address, browser
          type, pages visited) for security and reliability.
        </li>
      </ul>

      <h2 className="text-xl font-semibold text-ink-900">How we use information</h2>
      <p>
        We use your information to run the comparison service, improve product
        matching, remember your preferences, and keep the site secure. We do not sell
        your personal information to third parties.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Affiliate links and cookies</h2>
      <p>
        When you click links to retailers (including Amazon), those sites may set
        their own cookies and collect data under their privacy policies. We may earn
        commissions through affiliate programs. See our{" "}
        <Link href="/affiliate-disclosure" className="text-orange-700 underline">
          Affiliate Disclosure
        </Link>
        .
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Amazon Associates</h2>
      <p>
        {APP_NAME} participates in the Amazon Services LLC Associates Program. Amazon
        may use cookies and similar technologies to track referrals from our site in
        accordance with Amazon&apos;s policies.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Data retention</h2>
      <p>
        Search history and price cache data may be stored in our database for a limited
        time to improve results, then deleted or expired per our retention settings.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Your choices</h2>
      <p>
        You may stop using the service at any time. Account holders may request
        deletion of their account by contacting us.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Children</h2>
      <p>
        {APP_NAME} is not directed at children under 13. We do not knowingly collect
        personal information from children.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-700 underline">
          {CONTACT_EMAIL}
        </a>
        . See our <Link href="/contact" className="text-orange-700 underline">Contact</Link> page.
      </p>
    </LegalLayout>
  );
}
