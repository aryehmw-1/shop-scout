"use client";

import type { ProductOffer } from "@/lib/types";
import { formatPrice } from "@/lib/utils/format";

interface DeliveredPriceBreakdownProps {
  offer: ProductOffer;
  compact?: boolean;
}

export function DeliveredPriceBreakdown({ offer, compact }: DeliveredPriceBreakdownProps) {
  const shipping = offer.estimatedShipping ?? offer.deliveryFee;
  const tax = offer.estimatedTax;
  const total = offer.deliveredTotal ?? offer.landedCost;

  if (offer.price <= 0 || total == null) return null;
  if (shipping == null && tax == null && total <= offer.price) return null;

  const confidence = offer.deliveredPriceConfidence;
  const confidenceLabel =
    confidence == null ? null
    : confidence >= 0.75 ? "Strong estimate"
    : confidence >= 0.55 ? "Estimated delivered total"
    : "Rough estimate — add ZIP";

  if (compact) {
    return (
      <p className="text-[10px] leading-snug text-stone-500">
        Delivered ~{formatPrice(total)}
        {shipping != null && shipping > 0 ? ` · ship ${formatPrice(shipping)}` : shipping === 0 ? " · free ship" : ""}
        {tax != null ? ` · tax ${formatPrice(tax)}` : ""}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/80 px-2.5 py-2 text-xs text-stone-700">
      <p className="mb-1 font-semibold text-stone-700">Estimated delivered</p>
      <dl className="space-y-1">
        <div className="flex justify-between gap-2">
          <dt>Item</dt>
          <dd className="font-medium text-stone-900">{formatPrice(offer.price)}</dd>
        </div>
        {shipping != null && (
          <div className="flex justify-between gap-2">
            <dt>Shipping</dt>
            <dd className={shipping === 0 ? "font-medium text-emerald-700" : "text-stone-800"}>
              {shipping === 0 ? "Free" : formatPrice(shipping)}
            </dd>
          </div>
        )}
        {tax != null && (
          <div className="flex justify-between gap-2">
            <dt>Tax (est.)</dt>
            <dd className="text-stone-800">{formatPrice(tax)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2 border-t border-stone-200/80 pt-1 font-semibold text-stone-900">
          <dt>Est. delivered</dt>
          <dd>{formatPrice(total)}</dd>
        </div>
      </dl>
      {offer.freeShippingEligible && offer.freeShippingThreshold && (
        <p className="mt-1 text-[11px] font-medium text-emerald-700">
          Free shipping over {formatPrice(offer.freeShippingThreshold)}
        </p>
      )}
      {offer.memberPricingApplied && (
        <p className="mt-0.5 text-[11px] font-medium text-violet-700">Member pricing applied</p>
      )}
      {offer.pickupEligible && (
        <p className="mt-0.5 text-[11px] text-stone-500">Pickup may be available</p>
      )}
      {(confidenceLabel || offer.deliveredPriceNote) && (
        <p className="mt-1 text-[11px] text-stone-400">
          {confidenceLabel}
          {confidenceLabel && offer.deliveredPriceNote ? " · " : ""}
          {offer.deliveredPriceNote}
        </p>
      )}
    </div>
  );
}
