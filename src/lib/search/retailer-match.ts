import { retailerIdFromProductUrl } from "../matching/url-parser";
import { RETAILERS } from "../retailers/meta";
import { isShoppableRetailer } from "../retailers/retailers-shoppable";
import type { RetailerId } from "../types";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const EXACT_SOURCE = new Map<string, RetailerId>();

function registerExact(label: string, id: RetailerId) {
  EXACT_SOURCE.set(normalize(label), id);
}

for (const r of RETAILERS) {
  registerExact(r.name, r.id);
  registerExact(r.shortName, r.id);
  registerExact(r.id, r.id);
}

registerExact("dicks sporting goods", "dicks");
registerExact("dick's sporting goods", "dicks");
registerExact("the children's place", "childrensplace");
registerExact("children's place", "childrensplace");
registerExact("academy sports", "academy");
registerExact("academy sports + outdoors", "academy");
registerExact("bass pro shops", "basspro");
registerExact("sportsman's warehouse", "sportsmanswarehouse");
registerExact("big 5 sporting goods", "big5");
registerExact("pottery barn kids", "potterybarnkids");
registerExact("marshalls", "marshalls");
registerExact("marshall's", "marshalls");
registerExact("tj maxx", "tjmaxx");
registerExact("tjmaxx", "tjmaxx");

/**
 * Map SerpAPI row → retailer. URL hostname wins; source label only when link is missing.
 */
export function matchRetailerFromSource(
  source: string,
  link?: string,
): RetailerId | undefined {
  if (link?.startsWith("http")) {
    const fromUrl = retailerIdFromProductUrl(link);
    if (fromUrl) return fromUrl;
    return undefined;
  }

  const n = normalize(source);
  const exact = EXACT_SOURCE.get(n);
  if (exact && isShoppableRetailer(exact)) return exact;

  return undefined;
}
