import { catalogConnector } from "./catalog-connector";
import type { PriceConnector } from "../types";

export const PRICE_CONNECTORS: PriceConnector[] = [catalogConnector];

export function getCatalogConnector(): typeof catalogConnector {
  return catalogConnector;
}
