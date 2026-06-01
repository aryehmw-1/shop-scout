import type { ProductOffer, RetailerId, ShoppingIntent } from "../types";
import { hasUserZip, resolveCatalogZip } from "../constants";

export interface DeliveredPriceEstimate {
  itemPrice: number;
  estimatedShipping: number;
  estimatedTax: number;
  deliveredTotal: number;
  confidence: number;
  freeShippingThreshold?: number;
  freeShippingEligible?: boolean;
  memberPricingApplied?: boolean;
  pickupEligible?: boolean;
  note?: string;
}

export interface PricingPreferences {
  hasPrime?: boolean;
  hasWalmartPlus?: boolean;
  hasTargetCircle?: boolean;
  fulfillmentPreference?: "shipping" | "pickup" | "either";
}

const FREE_SHIPPING_THRESHOLDS: Partial<Record<RetailerId, number>> = {
  amazon: 35,
  walmart: 35,
  target: 35,
  costco: 75,
};

const BASE_SHIPPING: Partial<Record<RetailerId, number>> = {
  amazon: 6.99,
  walmart: 6.99,
  target: 5.99,
  kroger: 7.95,
  wholefoods: 9.95,
  costco: 0,
};

/** Rough state sales-tax rate from ZIP prefix (estimate only). */
function estimateTaxRate(zip?: string): number {
  if (!zip || !/^\d{5}$/.test(zip)) return 0.0825;
  const prefix = parseInt(zip.slice(0, 3), 10);
  if (prefix >= 900 && prefix <= 966) return 0.0925;
  if (prefix >= 100 && prefix <= 149) return 0.08875;
  if (prefix >= 750 && prefix <= 799) return 0.0825;
  if (prefix >= 600 && prefix <= 629) return 0.1025;
  if (prefix >= 970 && prefix <= 979) return 0.0;
  return 0.07 + (prefix % 7) * 0.002;
}

function memberFreeShipping(retailer: RetailerId, prefs: PricingPreferences): boolean {
  if (retailer === "amazon" && prefs.hasPrime) return true;
  if (retailer === "walmart" && prefs.hasWalmartPlus) return true;
  if (retailer === "target" && prefs.hasTargetCircle) return true;
  return false;
}

function memberPriceDiscount(retailer: RetailerId, prefs: PricingPreferences, price: number): {
  price: number;
  applied: boolean;
} {
  if (retailer === "amazon" && prefs.hasPrime && price > 0) {
    return { price: Math.round(price * 0.98 * 100) / 100, applied: true };
  }
  if (retailer === "walmart" && prefs.hasWalmartPlus && price > 0) {
    return { price: Math.round(price * 0.97 * 100) / 100, applied: true };
  }
  return { price, applied: false };
}

export function estimateDeliveredPrice(
  offer: ProductOffer,
  intent?: ShoppingIntent,
  prefs: PricingPreferences = {},
): DeliveredPriceEstimate {
  const zip = hasUserZip(intent?.zipCode) ? intent!.zipCode! : undefined;
  const itemBase = offer.price;
  const { price: itemPrice, applied: memberPricingApplied } = memberPriceDiscount(
    offer.retailer,
    prefs,
    itemBase,
  );

  const threshold = FREE_SHIPPING_THRESHOLDS[offer.retailer];
  const baseShip = BASE_SHIPPING[offer.retailer] ?? 5.99;
  const memberShipFree = memberFreeShipping(offer.retailer, prefs);
  const freeShippingEligible =
    memberShipFree || (threshold != null && itemPrice >= threshold);

  let estimatedShipping = 0;
  if (!freeShippingEligible) {
    estimatedShipping = offer.deliveryFee ?? baseShip;
  }

  const taxRate = estimateTaxRate(zip ?? resolveCatalogZip(intent?.zipCode));
  const taxable = itemPrice + (estimatedShipping > 0 ? estimatedShipping * 0.5 : 0);
  const estimatedTax = Math.round(taxable * taxRate * 100) / 100;
  const deliveredTotal = Math.round((itemPrice + estimatedShipping + estimatedTax) * 100) / 100;

  let confidence = zip ? 0.72 : 0.48;
  if (offer.priceSource === "scraped" || offer.priceSource === "connector_api") confidence += 0.12;
  if (offer.priceSource === "catalog_model") confidence -= 0.18;
  if (memberPricingApplied) confidence -= 0.05;
  confidence = Math.max(0.25, Math.min(0.92, confidence));

  const notes: string[] = [];
  if (!zip) notes.push("Add ZIP for regional tax/shipping");
  else if (!hasUserZip(intent?.zipCode)) notes.push("Estimated for your region");
  if (freeShippingEligible && threshold && !memberShipFree) {
    notes.push(`Free shipping over $${threshold.toFixed(0)}`);
  }
  if (memberPricingApplied) notes.push("Member pricing applied");

  return {
    itemPrice,
    estimatedShipping,
    estimatedTax,
    deliveredTotal,
    confidence,
    freeShippingThreshold: threshold,
    freeShippingEligible,
    memberPricingApplied,
    pickupEligible: offer.pickupAvailable,
    note: notes.length ? notes.join(" · ") : undefined,
  };
}

export function applyDeliveredPricing(
  offer: ProductOffer,
  intent?: ShoppingIntent,
  prefs: PricingPreferences = {},
): ProductOffer {
  if (offer.price <= 0) return offer;

  const est = estimateDeliveredPrice(offer, intent, prefs);
  return {
    ...offer,
    price: est.itemPrice,
    deliveryFee: est.estimatedShipping,
    estimatedShipping: est.estimatedShipping,
    estimatedTax: est.estimatedTax,
    deliveredTotal: est.deliveredTotal,
    landedCost: est.deliveredTotal,
    deliveredPriceConfidence: est.confidence,
    freeShippingThreshold: est.freeShippingThreshold,
    freeShippingEligible: est.freeShippingEligible,
    memberPricingApplied: est.memberPricingApplied,
    pickupEligible: est.pickupEligible,
    deliveredPriceNote: est.note,
    dealLabel:
      est.deliveredTotal === est.itemPrice && offer.dealLabel === "best_deal"
        ? offer.dealLabel
        : offer.dealLabel,
  };
}

export function applyDeliveredPricingToOffers(
  offers: ProductOffer[],
  intent?: ShoppingIntent,
  prefs: PricingPreferences = {},
): ProductOffer[] {
  return offers.map((o) => applyDeliveredPricing(o, intent, prefs));
}
