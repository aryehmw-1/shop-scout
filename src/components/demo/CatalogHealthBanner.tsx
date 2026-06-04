import type { CanonicalCatalogHealth } from "@/lib/demo-commerce/canonical/catalog-health";
import Link from "next/link";

/** Calm warning when inventory is missing, partial, or stale. */
export function CatalogHealthBanner({ health }: { health: CanonicalCatalogHealth }) {
  if (health.status === "healthy" && health.alerts.length === 0) return null;

  const isCritical = !health.demoReady || health.status === "corrupt" || health.status === "missing";
  const title =
    health.status === "missing" ? "Inventory not built"
    : health.status === "corrupt" ? "Inventory data needs repair"
    : health.status === "stale" ? "Inventory may be out of date"
    : health.status === "partial" ? "Limited product coverage"
    : "Inventory notice";

  return (
    <div
      className={`mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-12 ${
        isCritical ?
          "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        : "rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700"
      }`}
      role="status"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-relaxed">
        {health.publishedCount} products ready
        {health.rawProductCount > health.publishedCount ?
          ` (${health.droppedByValidation} dropped by validation)`
        : ""}
        {health.updatedAt ?
          ` · updated ${new Date(health.updatedAt).toLocaleDateString()}`
        : ""}
        .
      </p>
      {health.alerts[0] && <p className="mt-1 text-xs opacity-90">{health.alerts[0]}</p>}
      <p className="mt-2 text-xs">
        <Link href="/inventory/status" className="font-semibold text-sage-800 underline">
          Inventory status
        </Link>
        {!health.demoReady ?
          <>
            {" "}
            · Compare in{" "}
            <Link href="/chat" className="font-semibold text-sage-800 underline">
              chat
            </Link>{" "}
            still works when intelligence graphs are loaded.
          </>
        : null}
      </p>
    </div>
  );
}
