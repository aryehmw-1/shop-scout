import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { CanonicalCatalogShell } from "@/components/demo/CanonicalCatalogShell";
import { DemoCatalogShell } from "@/components/demo/DemoCatalogShell";
import { queryCanonicalCatalog, hasCanonicalCatalog } from "@/lib/demo-commerce/canonical/store";
import { queryDemoCatalog } from "@/lib/demo-commerce/store";
import {
  filterPublicCanonicalCatalog,
  filterPublicDemoCatalog,
} from "@/lib/retailers/public-retailers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Compare Products | Shop Scout",
  description:
    "Browse high-confidence products compared across Amazon, Costco, Kroger, and more.",
};

export default async function DemoCatalogPage() {
  const useCanonical = hasCanonicalCatalog();
  const canonical = useCanonical ? filterPublicCanonicalCatalog(queryCanonicalCatalog()) : null;
  const legacy = !useCanonical ? filterPublicDemoCatalog(queryDemoCatalog({ validOnly: true })) : null;

  return (
    <AppShell>
      <main className="min-w-0 flex-1">
        {useCanonical && canonical ?
          <CanonicalCatalogShell initial={canonical} />
        : legacy ?
          <DemoCatalogShell initial={legacy} />
        : (
          <div className="mx-auto max-w-lg px-4 py-20 text-center text-ink-600">
            <p className="text-lg font-medium">Catalog not built yet</p>
            <p className="mt-2 text-sm">
              Run{" "}
              <code className="rounded bg-cream-200 px-1">npm run demo:build-canonical</code> with
              Amazon PA-API keys, then commit{" "}
              <code className="rounded bg-cream-200 px-1">data/canonical-products.json</code>.
            </p>
          </div>
        )}
        <Footer />
      </main>
    </AppShell>
  );
}
