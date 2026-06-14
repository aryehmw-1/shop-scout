import { SavedProductsLayoutsPreview } from "@/components/SavedProductsLayoutsPreview";

export const metadata = {
  title: "Saved Products layouts (preview)",
  robots: { index: false, follow: false },
};

// Internal preview to compare Saved Products layouts (phone + desktop) on localhost.
export default function SavedLayoutsPage() {
  return <SavedProductsLayoutsPreview />;
}
