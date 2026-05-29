import type { ProductOffer } from "../types";
import { isVerifiedOffer, offerTrustLabel } from "../offers/offer-trust";
import { formatPrice } from "../utils/format";
import { formatLastVerified } from "./deal-display";

export interface OfferPriceDisplay {
  main: string;
  sub: string;
  showWasPrice: boolean;
  trustLabel: string;
  trustTier: "verified" | "estimated" | "unavailable";
  badgeLabel?: "VERIFIED PRICE" | "ESTIMATED PRICE" | "PRICE UNAVAILABLE";
  unavailableReason?: string;
  /** Deal intelligence copy for UI. */
  dealHeadline?: string;
  marketComparison?: string;
  lastVerifiedLabel?: string;
  trustedMatchLabel?: string;
}

function unavailableReason(offer: ProductOffer): string | undefined {
  return (
    offer.pipelineDebug?.rejectedReason ??
    (offer.priceSource === "scraped" && offer.price <= 0 ?
      "scrape_no_price"
    : undefined)
  );
}

function hadScrapeAttempt(offer: ProductOffer): boolean {
  return (
    offer.priceSource === "scraped" ||
    offer.pipelineDebug?.extractionMethod != null ||
    offer.pipelineDebug?.validationStatus === "rejected"
  );
}

function dealHeadline(offer: ProductOffer): string | undefined {
  if (offer.dealLabel === "best_deal") return "Best Deal";
  if (offer.isHistoricalLow) return "Lowest price we've seen";
  if (offer.isGoodDeal && offer.percentBelowMarket != null && offer.percentBelowMarket >= 5) {
    return `${offer.percentBelowMarket}% below market avg`;
  }
  if (offer.percentBelowCatalog != null && offer.percentBelowCatalog >= 8) {
    return `${offer.percentBelowCatalog}% below catalog estimate`;
  }
  return undefined;
}

function marketComparison(offer: ProductOffer): string | undefined {
  if (offer.marketMedianPrice && offer.percentBelowMarket != null) {
    return `${formatPrice(offer.price)} vs ${formatPrice(offer.marketMedianPrice)} market median`;
  }
  return undefined;
}

export function getOfferPriceDisplay(offer: ProductOffer): OfferPriceDisplay {
  const trustLabel = offerTrustLabel(offer);
  const reason = unavailableReason(offer);
  const lastVerifiedLabel = formatLastVerified(offer);
  const trustedMatchLabel =
    (offer.matchConfidence ?? 0) >= 0.62 ? "Trusted match" : undefined;

  if (isVerifiedOffer(offer) && offer.price > 0) {
    const headline = dealHeadline(offer);
    return {
      main: formatPrice(offer.price),
      sub: headline ?? offer.priceNote ?? trustLabel,
      showWasPrice: Boolean(
        offer.movingAvgPrice && offer.movingAvgPrice > offer.price + 0.01,
      ),
      trustLabel,
      trustTier: "verified",
      badgeLabel: "VERIFIED PRICE",
      dealHeadline: headline,
      marketComparison: marketComparison(offer),
      lastVerifiedLabel,
      trustedMatchLabel,
    };
  }

  if (hadScrapeAttempt(offer) && (!offer.price || offer.price <= 0 || reason)) {
    const why =
      reason === "fetch_failed" ? "Retailer page could not be loaded"
      : reason === "search_url_not_pdp" ? "Link is a search page, not a product page"
      : reason === "scrape_no_price" ? "Price not found on product page"
      : reason === "not_canonical_pdp" ? "Could not confirm product page URL"
      : reason === "suspicious_price" ? "Price flagged as outlier"
      : reason?.startsWith("http_") ? `Retailer returned ${reason.replace("http_", "")}`
      : reason ? reason.replace(/_/g, " ")
      : "Could not verify price on retailer page";

    return {
      main: "Price unavailable",
      sub: `${why} · Check retailer`,
      showWasPrice: false,
      trustLabel: "Could not verify live price",
      trustTier: "unavailable",
      badgeLabel: "PRICE UNAVAILABLE",
      unavailableReason: why,
    };
  }

  if (
    offer.priceSource === "catalog_model" ||
    offer.priceSource === "daily_index" ||
    offer.priceSource === "nightly_index" ||
    offer.priceSource === "cached_quote"
  ) {
    return {
      main: "Check retailer",
      sub: "Estimated · open store for current price",
      showWasPrice: false,
      trustLabel,
      trustTier: "estimated",
      badgeLabel: "ESTIMATED PRICE",
    };
  }

  const fallbackMain =
    offer.price > 0 ? `~${formatPrice(offer.price)}` : "Check retailer";

  return {
    main: fallbackMain,
    sub: offer.priceNote ?? "Estimated · verify at retailer",
    showWasPrice: false,
    trustLabel,
    trustTier: "estimated",
    badgeLabel: "ESTIMATED PRICE",
  };
}
