import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { VerifiedInventoryClient } from "@/components/verified/VerifiedInventoryClient";
import { loadVerifiedInventoryBrowse } from "@/lib/inventory/verified-inventory-browse";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verified Inventory | Shop Scout",
  description:
    "Browse grocery and household products with persisted, verified Amazon pricing.",
};

export default async function VerifiedInventoryPage() {
  const initial = await loadVerifiedInventoryBrowse("all");

  return (
    <AppShell>
      <main className="min-w-0 flex-1">
        <div className="border-b border-orange-100/80 bg-cream-50/90 px-4 py-8 sm:px-6 lg:px-12">
          <div className="mx-auto max-w-5xl">
            <h1 className="font-homy text-3xl font-bold text-ink-900">
              Verified Inventory
            </h1>
            <p className="mt-2 max-w-2xl text-ink-600">
              Products with persisted verified pricing — indexed nightly, pack-normalized,
              and manually QA-reviewed where available. Our most trustworthy compare
              experience today.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-12">
          <VerifiedInventoryClient initial={initial} />
        </div>

        <Footer />
      </main>
    </AppShell>
  );
}
