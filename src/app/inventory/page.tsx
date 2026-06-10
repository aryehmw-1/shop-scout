import { Footer } from "@/components/Footer";
import { CanonicalCatalogClient } from "@/components/demo/CanonicalCatalogClient";
import { DemoCatalogClient } from "@/components/demo/DemoCatalogClient";
import { CatalogHealthBanner } from "@/components/demo/CatalogHealthBanner";
import { VerifiedInventoryClient } from "@/components/verified/VerifiedInventoryClient";
import { assessCanonicalCatalogHealth } from "@/lib/demo-commerce/canonical/catalog-health";
import { queryCanonicalCatalog, hasCanonicalCatalog } from "@/lib/demo-commerce/canonical/store";
import { queryDemoCatalog } from "@/lib/demo-commerce/store";
import { loadVerifiedInventoryBrowse } from "@/lib/inventory/verified-inventory-browse";
import {
  filterPublicCanonicalCatalog,
  filterPublicDemoCatalog,
} from "@/lib/retailers/public-retailers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory | Homivion",
  description:
    "Browse products with persisted pricing and multi-store compare pricing in one place.",
};

export default async function InventoryPage() {
  const verified = await loadVerifiedInventoryBrowse("all");
  const catalogHealth = assessCanonicalCatalogHealth();
  const useCanonical = hasCanonicalCatalog();
  const canonical = useCanonical ? filterPublicCanonicalCatalog(queryCanonicalCatalog()) : null;
  const legacy = !useCanonical ? filterPublicDemoCatalog(queryDemoCatalog({ validOnly: true })) : null;
  return (
    <main className="min-w-0 flex-1">
        <div className="border-b border-orange-100/80 bg-cream-50/90 px-4 py-8 sm:px-6 lg:px-12">
          <div className="mx-auto max-w-6xl">
            <h1 className="font-homy text-3xl font-bold text-ink-900">Inventory</h1>
            <p className="mt-2 max-w-2xl text-ink-600">
              Persisted pricing and multi-store compare pricing — one inventory experience.
            </p>
            <Link
              href="/inventory/status"
              className="mt-3 inline-block text-sm font-semibold text-sage-700 hover:underline"
            >
              Inventory status →
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-12">
          <CatalogHealthBanner health={catalogHealth} />
        </div>

        {canonical && canonical.total > 0 && (
          <section className="border-b border-orange-100/80 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12">
              <h2 className="font-homy text-2xl font-bold text-ink-900">
                Multi-store pricing
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                {canonical.total} products with compare pricing across{" "}
                {canonical.retailers.length} retailers.
              </p>
              <div className="mt-6">
                <CanonicalCatalogClient initial={canonical} />
              </div>
            </div>
          </section>
        )}

        {!useCanonical && legacy && legacy.total > 0 && (
          <section className="border-b border-orange-100/80 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-12">
              <h2 className="font-homy text-2xl font-bold text-ink-900">
                Multi-store pricing
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Compare trusted products across {legacy.retailers.length} major retailers.
              </p>
              <div className="mt-6">
                <DemoCatalogClient initial={legacy} />
              </div>
            </div>
          </section>
        )}

        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-12">
          <VerifiedInventoryClient initial={verified} />
        </div>

        {!canonical?.total && !legacy?.total && !catalogHealth.demoReady && (
          <div className="mx-auto max-w-lg px-4 pb-12 text-center text-sm text-ink-600">
            <p>
              Multi-store pricing is still building. Refresh after the next product ingest.
            </p>
          </div>
        )}

        <Footer />
      </main>
  );
}
