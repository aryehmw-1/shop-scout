import type { RetailerId } from "../../types";
import type { PriceSource } from "../types";

/** Normalized per-retailer price row from any live provider (SerpAPI, DB cache, future APIs). */
export interface LiveQuote {
  retailerId: RetailerId;
  price: number;
  storeTitle: string;
  productUrl: string;
  imageUrl?: string;
  sourceLabel: string;
  priceSource?: PriceSource;
  shippingCost?: number;
  estimatedTax?: number;
  deliveredTotal?: number;
  providerSource?: "ebay" | "shopsavvy";
  externalOfferId?: string;
  sellerName?: string;
  sellerFeedbackPct?: number;
  sellerFeedbackScore?: number;
  condition?: string;
  returnPolicy?: string;
  /** From persisted DB row — used for trust gates and UI. */
  matchConfidence?: number;
  identityConfidence?: number;
  imageConfidence?: number;
  confidenceReasons?: Array<{ code: string; message: string; weight: number }>;
  fetchedAt?: string;
  expiresAt?: string;
  verifiedPersistedInventory?: boolean;
  qaStatus?: "approved" | "pending" | "rejected" | "none";
  normalizationNote?: string;
  dbSource?: string;
}
