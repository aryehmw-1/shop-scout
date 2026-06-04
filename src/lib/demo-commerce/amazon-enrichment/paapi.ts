import { amazonPaapiSearchItems } from "../../search/providers/amazon-paapi";

export interface PaapiEnrichmentHit {
  asin?: string;
  title: string;
  imageUrl?: string;
  pdpUrl: string;
  price?: number;
  categoryHint?: string;
}

function parseCategoryHint(item: {
  ItemInfo?: {
    Classifications?: {
      ProductGroup?: { DisplayValue?: string };
      Binding?: { DisplayValue?: string };
    };
  };
  BrowseNodeInfo?: {
    BrowseNodes?: Array<{ DisplayName?: string }>;
  };
}): string | undefined {
  const group = item.ItemInfo?.Classifications?.ProductGroup?.DisplayValue;
  if (group) return group;
  const binding = item.ItemInfo?.Classifications?.Binding?.DisplayValue;
  if (binding) return binding;
  const node = item.BrowseNodeInfo?.BrowseNodes?.[0]?.DisplayName;
  return node;
}

/** Low-volume PA-API search for enrichment (caller handles throttle + cache). */
export async function searchAmazonForEnrichment(
  keywords: string,
  itemCount = 5,
): Promise<PaapiEnrichmentHit[]> {
  const items = await amazonPaapiSearchItems(keywords, itemCount, { enrichment: true });
  const hits: PaapiEnrichmentHit[] = [];

  for (const row of items) {
    const url = row.DetailPageURL;
    const title = row.ItemInfo?.Title?.DisplayValue?.trim();
    if (!url || !title) continue;
    if (!/\/dp\/|\/gp\/product\//i.test(url)) continue;

    const image = row.Images?.Primary?.Medium?.URL;
    const price = row.Offers?.Listings?.[0]?.Price?.Amount;

    hits.push({
      asin: row.ASIN,
      title,
      imageUrl: image,
      pdpUrl: url.split("?")[0]!,
      price: typeof price === "number" && price > 0 ? price : undefined,
      categoryHint: parseCategoryHint(row as Parameters<typeof parseCategoryHint>[0]),
    });
  }

  return hits;
}
