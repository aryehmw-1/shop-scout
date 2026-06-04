import { encodeBase64Url } from "@/lib/encoding/base64url";
import type { DemoProduct } from "./types";

/** Commission-safe redirect via existing /api/outbound. */
export function buildDemoOutboundUrl(product: DemoProduct): string {
  const params = new URLSearchParams();
  params.set("to", encodeBase64Url(product.product_url));
  params.set("oid", product.id);
  params.set("r", product.retailer);
  if (product.price != null) params.set("p", String(product.price));
  params.set("src", "demo");
  return `/api/outbound?${params.toString()}`;
}
