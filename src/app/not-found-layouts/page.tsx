import { NotFoundLayoutsPreview } from "@/components/NotFoundLayoutsPreview";

export const metadata = {
  title: "Not-found layouts (preview)",
  robots: { index: false, follow: false },
};

// Internal preview: 5 desktop "we couldn't find it" layouts.
export default function NotFoundLayoutsPage() {
  return <NotFoundLayoutsPreview />;
}
