import { Footer } from "@/components/Footer";
import { VerifiedInventoryClient } from "@/components/verified/VerifiedInventoryClient";
import { loadVerifiedInventoryBrowse } from "@/lib/inventory/verified-inventory-browse";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory | Homivion",
  description: "Browse products with prices we've verified from the retailer.",
};

export default async function InventoryPage() {
  const verified = await loadVerifiedInventoryBrowse("all");
  return (
    <main className="min-w-0 flex-1">
      <div className="border-b border-orange-100/80 bg-cream-50/90 px-4 py-8 sm:px-6 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-homy text-3xl font-bold text-ink-900">Inventory</h1>
          <p className="mt-2 max-w-2xl text-ink-600">
            Products with prices we&apos;ve verified from the retailer.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-12">
        <VerifiedInventoryClient initial={verified} />
      </div>

      <Footer />
    </main>
  );
}
