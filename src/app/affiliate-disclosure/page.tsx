import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/LegalLayout";
import { APP_NAME } from "@/lib/constants";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Affiliate Disclosure",
  description: `How ${APP_NAME} uses affiliate links and earns commissions from partner retailers.`,
};

export default function AffiliateDisclosurePage() {
  const updated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <LegalLayout title="Affiliate Disclosure">
      <p>
        <strong>Last updated:</strong> {updated}
      </p>
      <p>
        {APP_NAME} (&quot;we,&quot; &quot;us&quot;) operates a price-comparison website
        and related tools. Some links on this site are <strong>affiliate links</strong>.
        If you click a link and make a purchase on a retailer&apos;s website, we may
        earn a commission at <strong>no extra cost to you</strong>.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Amazon Associates</h2>
      <p>
        {APP_NAME} is a participant in the Amazon Services LLC Associates Program, an
        affiliate advertising program designed to provide a means for sites to earn
        advertising fees by advertising and linking to Amazon.com and affiliated sites.
      </p>
      <p>
        Product prices and availability on Amazon are accurate only at the time shown
        and are subject to change. Amazon and the Amazon logo are trademarks of
        Amazon.com, Inc. or its affiliates.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Other retailers</h2>
      <p>
        We may also participate in affiliate or partner programs with Walmart, Target,
        and other retailers. Commissions help us operate and improve {APP_NAME}.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Editorial independence</h2>
      <p>
        Affiliate relationships do not determine which products we show or how we rank
        offers. Our goal is to surface useful comparisons; retailers do not pay for
        placement in our comparison results.
      </p>

      <h2 className="text-xl font-semibold text-ink-900">Questions</h2>
      <p>
        Contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-orange-700 underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalLayout>
  );
}
