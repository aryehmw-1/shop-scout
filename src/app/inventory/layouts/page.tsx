import { InventoryLayoutsPreview } from "@/components/verified/InventoryLayoutsPreview";
import { loadVerifiedInventoryBrowse } from "@/lib/inventory/verified-inventory-browse";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory layouts (preview)",
  robots: { index: false, follow: false },
};

// Internal preview to compare 4 compact inventory layouts on localhost.
export default async function InventoryLayoutsPage() {
  const verified = await loadVerifiedInventoryBrowse("all");
  return <InventoryLayoutsPreview initial={verified} />;
}
