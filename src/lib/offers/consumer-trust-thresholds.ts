// Consumer-trust numeric thresholds — a dependency-free LEAF module.
//
// These live apart from consumer-trust.ts so that modules which only need the
// numbers (e.g. offer-trust.ts) can import them WITHOUT pulling in consumer-trust
// (which imports offer-trust back). That circular edge previously caused a
// temporal-dead-zone crash ("Cannot access MIN_CONSUMER_BEST_DEAL_CONFIDENCE
// before initialization") whenever the bundler evaluated offer-trust first.
// Keep this file import-free.

/** Minimum match confidence for consumer UI (raised from persist floor 0.58). */
export const MIN_CONSUMER_MATCH_CONFIDENCE = 0.72;

/** Minimum image quality score — rejects placeholders and low-res thumbs. */
export const MIN_CONSUMER_IMAGE_CONFIDENCE = 0.4;

/** Minimum identity confidence when no exact UPC/GTIN match reason present. */
export const MIN_CONSUMER_IDENTITY_CONFIDENCE = 0.65;

/** Best-deal badge requires even higher confidence for link/compare flows. */
export const MIN_CONSUMER_BEST_DEAL_CONFIDENCE = 0.78;

/** @deprecated Tiered model uses retailer policies — kept for legacy diagnostics. */
export const CONSUMER_QUOTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
