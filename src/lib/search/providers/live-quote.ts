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
}
