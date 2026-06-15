import { CompareLayoutsPreview } from "@/components/CompareLayoutsPreview";

export const metadata = {
  title: "Compare layouts (preview)",
  robots: { index: false, follow: false },
};

// Internal preview to compare 5 desktop compare-page layouts on localhost.
export default function CompareLayoutsPage() {
  return <CompareLayoutsPreview />;
}
