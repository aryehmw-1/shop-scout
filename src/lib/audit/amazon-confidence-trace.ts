/**
 * Stage-by-stage matchConfidence trace for Amazon persist debugging.
 */

import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ShoppingIntent } from "../types";
import {
  applyOfferQualityGates,
  applyRetailerExtractionToOffer,
  MIN_TRUSTED_MATCH_CONFIDENCE,
} from "../offers/offer-quality";
import { scoreOfferConfidence } from "../identity/offer-confidence";
import { validateAmazonOffer } from "../offers/amazon-validation";
import { validateOfferBeforePersist } from "../offers/offer-persist-validation";
import type { RetailerPageExtraction } from "../offers/retailer-page-extract";

export interface ConfidenceSnapshot {
  stage: string;
  matchConfidence: number;
  identityConfidence: number;
  imageConfidence: number;
  priceSource: string;
  price: number;
  note?: string;
}

export interface AmazonConfidencePipelineTrace {
  catalogId: string;
  stages: ConfidenceSnapshot[];
  persistRejection?: string;
  persistOk: boolean;
}

function snap(
  stage: string,
  offer: ProductOffer,
  note?: string,
): ConfidenceSnapshot {
  return {
    stage,
    matchConfidence: Math.round((offer.matchConfidence ?? 0) * 1000) / 1000,
    identityConfidence: Math.round((offer.identityConfidence ?? 0) * 1000) / 1000,
    imageConfidence: Math.round((offer.imageConfidence ?? 0) * 1000) / 1000,
    priceSource: offer.priceSource ?? "catalog_model",
    price: offer.price,
    note,
  };
}

/** Replay post-fetch pipeline stages without network (for deterministic tracing). */
export function traceAmazonConfidencePipeline(
  baseline: ProductOffer,
  item: CatalogItem,
  intent: ShoppingIntent,
  extraction: RetailerPageExtraction,
): AmazonConfidencePipelineTrace {
  const stages: ConfidenceSnapshot[] = [snap("1_compare_baseline", baseline)];

  const afterExtraction = applyRetailerExtractionToOffer(
    { ...baseline },
    extraction,
    item,
  );
  stages.push(
    snap("2_after_retailer_extraction", afterExtraction, extraction.priceUsd ?
      `raw=$${extraction.priceUsd}`
    : undefined),
  );

  const priorConf = afterExtraction.matchConfidence ?? 0;
  const priorIdentity = afterExtraction.identityConfidence ?? 0;
  const priorReasons = afterExtraction.confidenceReasons ?? [];

  const confidence = scoreOfferConfidence(item, intent, afterExtraction.retailer, {
    storeTitle: afterExtraction.storeTitle,
    brand: afterExtraction.brand,
    color: intent.colors?.[0],
    size: afterExtraction.size,
    upc: afterExtraction.upc,
    imageUrl: afterExtraction.imageUrl,
    productUrl: afterExtraction.productUrl,
    priceSource: afterExtraction.priceSource,
  });

  let matchConfidence = confidence.matchConfidence;
  let identityConfidence = confidence.identityConfidence;
  let imageConfidence = confidence.imageConfidence;

  if (
    afterExtraction.priceSource === "scraped" ||
    afterExtraction.priceSource === "connector_api"
  ) {
    matchConfidence = Math.max(matchConfidence, priorConf);
    identityConfidence = Math.max(identityConfidence, priorIdentity, priorConf);
    imageConfidence = Math.max(imageConfidence, afterExtraction.imageConfidence ?? 0);
  }

  stages.push(
    snap("3_after_rescore_pre_gates", {
      ...afterExtraction,
      matchConfidence,
      identityConfidence,
      imageConfidence,
    }, `rescore=${confidence.matchConfidence.toFixed(3)} merged=${matchConfidence.toFixed(3)}`),
  );

  let afterGates = applyOfferQualityGates(
    {
      ...afterExtraction,
      matchConfidence,
      identityConfidence,
      imageConfidence,
      confidenceReasons: [
        ...priorReasons,
        ...JSON.parse(confidence.confidenceReasonsJson),
      ],
    },
    item,
    intent,
  );

  if (
    (afterExtraction.priceSource === "scraped" ||
      afterExtraction.priceSource === "connector_api") &&
    priorConf >= MIN_TRUSTED_MATCH_CONFIDENCE
  ) {
    afterGates = {
      ...afterGates,
      matchConfidence: Math.max(
        afterGates.matchConfidence ?? 0,
        MIN_TRUSTED_MATCH_CONFIDENCE,
      ),
    };
  }

  stages.push(snap("4_after_quality_gates", afterGates));

  const amazonAtPersist = validateAmazonOffer(afterGates, item, intent);
  stages.push(
    snap("5_before_persist", afterGates, `amazon.accepted=${amazonAtPersist.accepted}`),
  );

  const persist = validateOfferBeforePersist(afterGates, item, intent);

  return {
    catalogId: item.id,
    stages,
    persistOk: persist.ok,
    persistRejection: persist.ok ?
      undefined
    : `${persist.reason}${persist.detail ? `: ${persist.detail}` : ""}`,
  };
}

export function formatConfidencePipelineTrace(
  trace: AmazonConfidencePipelineTrace,
): string {
  const lines = [
    `#### Confidence pipeline · ${trace.catalogId}`,
    "",
    "| Stage | match | identity | image | source | price | note |",
    "|-------|------:|---------:|------:|--------|------:|------|",
  ];
  for (const s of trace.stages) {
    lines.push(
      `| ${s.stage} | ${s.matchConfidence.toFixed(3)} | ${s.identityConfidence.toFixed(3)} | ${s.imageConfidence.toFixed(3)} | ${s.priceSource} | $${s.price.toFixed(2)} | ${s.note ?? ""} |`,
    );
  }
  lines.push(
    "",
    `- **Persist:** ${trace.persistOk ? "PASS" : trace.persistRejection ?? "FAIL"}`,
  );
  return lines.join("\n");
}
