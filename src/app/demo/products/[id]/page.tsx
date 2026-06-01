import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Product detail pages require the demo catalog bundle — route to /demo for now. */
export default function DemoProductDetailPage() {
  redirect("/demo");
}
