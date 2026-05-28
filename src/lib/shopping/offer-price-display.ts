import type { ProductOffer } from "../types";
import { formatPrice } from "../utils/format";
import { isVerifiedLivePrice } from "../search/price-truth";

export interface OfferPriceDisplay {
  main: string;
  sub: string;
  showWasPrice: boolean;
}

export function getOfferPriceDisplay(offer: ProductOffer): OfferPriceDisplay {
  if (isVerifiedLivePrice(offer)) {
    return {
      main: formatPrice(offer.price),
      sub: offer.priceNote ?? "Live price",
      showWasPrice: Boolean(offer.wasPrice && offer.wasPrice > offer.price),
    };
  }

  if (offer.priceNote?.toLowerCase().includes("check store")) {
    return {
      main: "See store",
      sub: "We couldn't verify this store's price — open the link for the current price.",
      showWasPrice: false,
    };
  }

  return {
    main: `~${formatPrice(offer.price)}`,
    sub: offer.priceNote ?? "Estimated — verify at store",
    showWasPrice: false,
  };
}
