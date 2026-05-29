import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparePageClient } from "./ComparePageClient";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Compare Prices",
  description:
    "Compare verified live prices across Amazon, Walmart, Target, and more. See savings, trust scores, and price history in one view.",
  openGraph: {
    title: `Compare Prices · ${APP_NAME}`,
    description:
      "Side-by-side price comparison with verified offers, savings context, and retailer trust signals.",
  },
};

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-stone-500">
          Loading compare…
        </div>
      }
    >
      <ComparePageClient />
    </Suspense>
  );
}
