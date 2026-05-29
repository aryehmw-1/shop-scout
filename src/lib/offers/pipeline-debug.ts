export interface PipelineDebugRow {
  retailer: string;
  stage: string;
  rawPrice?: number;
  normalizedPrice?: number;
  dbPrice?: number;
  renderedPrice?: number;
  priceSource?: string;
  rawImage?: string;
  renderedImage?: string;
  productUrl?: string;
  note?: string;
}

const ENABLED =
  process.env.PIPELINE_DEBUG === "1" ||
  process.env.INDEX_OFFER_DIAGNOSTICS === "1";

export function pipelineDebugEnabled(): boolean {
  return ENABLED;
}

export function logPipelineDebug(
  catalogId: string,
  rows: PipelineDebugRow[],
): void {
  if (!ENABLED) return;
  console.log(
    `[pipeline-debug] ${catalogId}`,
    JSON.stringify(rows.slice(0, 24), null, 0),
  );
}

export function rowFromOffer(
  offer: {
    retailer: string;
    price: number;
    imageUrl?: string;
    productUrl?: string;
    priceSource?: string;
  },
  stage: string,
  extra?: Partial<PipelineDebugRow>,
): PipelineDebugRow {
  return {
    retailer: offer.retailer,
    stage,
    renderedPrice: offer.price,
    renderedImage: offer.imageUrl,
    priceSource: offer.priceSource,
    productUrl: offer.productUrl,
    ...extra,
  };
}
