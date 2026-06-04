import { catalogConnector } from "./catalog-connector";
import { dbConnector } from "./db-connector";
import type { PriceConnector } from "../types";

// TODO: remove catalogConnector once real inventory is populated and verified.
// It exists solely as a low-priority fallback that generates estimated prices
// from the hardcoded in-memory catalog. All production traffic should be served
// by dbConnector (priority 1) or live API connectors.
export const PRICE_CONNECTORS: PriceConnector[] = [dbConnector, catalogConnector];

export function getCatalogConnector(): typeof catalogConnector {
  return catalogConnector;
}

export function getDbConnector(): typeof dbConnector {
  return dbConnector;
}
