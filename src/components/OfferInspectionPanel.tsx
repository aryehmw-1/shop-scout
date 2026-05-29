"use client";

import type { ProductOffer } from "@/lib/types";
import { isVerifiedOffer } from "@/lib/offers/offer-trust";
import { classifyProductUrl } from "@/lib/offers/url-classifier";
import { scrapeAgeBadge } from "@/lib/shopping/offer-price-badges";

function debugExpanded(): boolean {
  if (typeof window === "undefined") return false;
  return (
    process.env.NEXT_PUBLIC_OFFER_DEBUG === "1" ||
    process.env.NEXT_PUBLIC_PIPELINE_DEBUG === "1"
  );
}

interface OfferInspectionPanelProps {
  offer: ProductOffer;
}

export function OfferInspectionPanel({ offer }: OfferInspectionPanelProps) {
  const d = offer.pipelineDebug;
  const verified = isVerifiedOffer(offer);
  const age = scrapeAgeBadge(offer);

  if (debugExpanded() && typeof window !== "undefined") {
    console.info("[offer-inspect]", offer.retailer, {
      id: offer.id,
      verified,
      price: offer.price,
      priceSource: offer.priceSource,
      productUrl: offer.productUrl,
      imageUrl: offer.imageUrl,
      pipeline: d,
    });
  }

  return (
    <>
      <p className="text-[10px] leading-snug text-stone-500">
        {age && <span className="font-semibold text-stone-600">{age}</span>}
        {age && " · "}
        Source: <span className="font-mono">{offer.priceSource ?? d?.source ?? "—"}</span>
        {d?.cacheHit != null && (
          <>
            {" "}
            · cache {d.cacheHit ? "hit" : "miss"}
          </>
        )}
      </p>

      {debugExpanded() && (
        <details className="mt-2 rounded-lg border border-dashed border-violet-300 bg-violet-50/80 p-2 text-[10px] text-violet-950">
          <summary className="cursor-pointer font-semibold">Pipeline debug</summary>
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="font-semibold">DB / price source</dt>
              <dd>{offer.priceSource ?? d?.source ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Extraction method</dt>
              <dd>{d?.extractionMethod ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Scrape timestamp</dt>
              <dd>{d?.scrapeTimestamp ?? offer.priceAsOf ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Scrape status</dt>
              <dd>
                {d?.validationStatus ?? "—"}
                {d?.rejectedReason ? ` · rejected: ${d.rejectedReason}` : ""}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Image method / level</dt>
              <dd>
                L{d?.imageFallbackLevel ?? "?"} · {d?.imageExtractionMethod ?? "—"}
                {d?.imageNormalized ? " · normalized" : ""}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Image URL</dt>
              <dd className="break-all">{d?.imageUrlResolved ?? offer.imageUrl}</dd>
            </div>
            <div>
              <dt className="font-semibold">URL validation</dt>
              <dd>
                {d?.urlValidation?.ok ? "ok" : "fail"}
                {d?.urlValidation?.httpStatus != null ?
                  ` · HTTP ${d.urlValidation.httpStatus}`
                : ""}
                {d?.urlValidation?.reason ? ` · ${d.urlValidation.reason}` : ""}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Canonical / kind</dt>
              <dd>
                {classifyProductUrl(d?.urlValidation?.finalUrl ?? offer.productUrl)}
                <span className="block break-all opacity-80">
                  {d?.urlValidation?.finalUrl ?? offer.productUrl}
                </span>
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Verified</dt>
              <dd>{verified ? "yes" : "no"}</dd>
            </div>
          </dl>
        </details>
      )}
    </>
  );
}
