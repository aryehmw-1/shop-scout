import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { APP_NAME } from "@/lib/constants";
import { CONTACT_EMAIL, getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Contact ${APP_NAME} for support, privacy, or partnership questions.`,
};

export default function ContactPage() {
  const siteUrl = getSiteUrl();

  return (
    <LegalLayout title="Contact">
      <p>
        We&apos;d love to hear from you. {APP_NAME} is operated as an independent
        price-comparison service at{" "}
        <a href={siteUrl} className="text-orange-700 underline">
          {siteUrl}
        </a>
        .
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Email</h2>
      <p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-lg font-medium text-orange-700 underline"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
      <p className="text-sm text-ink-500">
        Typical response time: 1–2 business days.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Common topics</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Price accuracy or a wrong product match</li>
        <li>Privacy and data requests — see our <Link href="/privacy" className="text-orange-700 underline">Privacy Policy</Link></li>
        <li>Affiliate and partnership questions</li>
        <li>Amazon Associates or retailer program inquiries</li>
      </ul>

      <h2 className="text-xl font-semibold text-ink-900">Try the product</h2>
      <p>
        For the fastest help comparing a specific item, use the{" "}
        <Link href="/chat" className="text-orange-700 underline">
          compare tool
        </Link>{" "}
        and include the product name or link in your email.
      </p>
    </LegalLayout>
  );
}
