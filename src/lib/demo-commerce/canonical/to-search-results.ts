import { getRetailerMeta } from "@/lib/retailers/meta";
import { filterPublicCanonicalProduct } from "@/lib/retailers/public-retailers";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import type { CanonicalProduct } from "./types";
import { canonicalDisplayImage } from "./display-image";

function offerToProductOffer(
  canonical: CanonicalProduct,
  offer: CanonicalProduct["offers"][0],
): ProductOffer {
  const meta = getRetailerMeta(offer.retailer);
  const imageUrl = canonicalDisplayImage({
    id: canonical.canonical_id,
    title: canonical.canonical_title,
    brand: canonical.brand,
    category: canonical.canonical_category,
    keywords: canonical.normalized_keywords,
    imageUrl: canonical.canonical_image,
  });

  return {
    id: `${canonical.canonical_id}-${offer.retailer}`,
    title: canonical.canonical_title,
    storeTitle: offer.store_title ?? canonical.canonical_title,
    brand: canonical.brand ?? "",
    size: "",
    catalogId: canonical.canonical_id,
    imageUrl,
    imageSource: "catalog",
    retailer: offer.retailer,
    retailerName: meta.name,
    channel: "online",
    price: offer.price,
    unitPrice: offer.price,
    unitLabel: "each",
    inStock: offer.availability === "in_stock",
    pickupAvailable: false,
    landedCost: offer.price,
    productUrl: offer.product_url,
    affiliateUrl: offer.product_url,
    matchConfidence: offer.confidence_score,
    priceSource: offer.retailer === "amazon" ? "connector_api" : "catalog_model",
    wasPrice:
      offer.list_price && offer.list_price > offer.price ? offer.list_price : undefined,
  };
}

/** Map canonical product + offers → compare-page search results shape. */
export function canonicalToSearchResults(
  canonical: CanonicalProduct,
  zipCode = "78701",
): ProductSearchResults {
  const publicProduct = filterPublicCanonicalProduct(canonical);
  const imageUrl = canonicalDisplayImage({
    id: canonical.canonical_id,
    title: canonical.canonical_title,
    brand: canonical.brand,
    category: canonical.canonical_category,
    keywords: canonical.normalized_keywords,
    imageUrl: canonical.canonical_image,
  });
  const online = [...publicProduct.offers]
    .sort((a, b) => a.price - b.price)
    .map((o) => offerToProductOffer(publicProduct, o));

  const fromPrice = online[0]?.price;

  return {
    local: [],
    online,
    zipCode,
    compareMode: true,
    matchedProduct: {
      title: canonical.canonical_title,
      brand: canonical.brand ?? "",
      imageUrl,
      fromPrice,
      imageSource: "catalog",
    },
    resolvedQuery: canonical.canonical_title,
    enrichmentPending: false,
    enrichmentCatalogId: canonical.canonical_id,
    retrievalMeta: {
      tier: "inventory",
      normalizationMessage: `Multi-store pricing · ${online.length} store${online.length === 1 ? "" : "s"}`,
      offerQuality: online.length >= 2 ? "verified" : "estimated",
    },
  };
}
