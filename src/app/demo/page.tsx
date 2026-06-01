import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Compare Products | Shop Scout",
  description:
    "Browse high-confidence products compared across Amazon, Costco, Kroger, and more.",
};

/** Placeholder until demo catalog modules are deployed. Re-enable once live retailer comparison + affiliate support is active. */
export default function DemoCatalogPage() {
  return (
    <AppShell>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-lg px-4 py-20 text-center text-ink-600">
          <p className="text-lg font-medium">Demo catalog coming soon</p>
          <p className="mt-2 text-sm">
            Compare prices now using{" "}
            <Link href="/chat" className="font-semibold text-sage-700 hover:underline">
              Compare prices
            </Link>{" "}
            or browse supported stores on the homepage.
          </p>
        </div>
        <Footer />
      </main>
    </AppShell>
  );
}
