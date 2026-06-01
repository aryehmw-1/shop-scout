export {
  getRetailerIntelligenceProfile,
  listRetailerIntelligenceProfiles,
  retailerIdFromHostname,
  requiresProxyForRetailer,
  extractionStrategiesForRetailer,
} from "./registry";
export type {
  AntiBotLevel,
  ExtractionContext,
  ExtractionStrategy,
  ExtractionStrategyHandler,
  FetchStrategy,
  FetchTransport,
  FetchTransportRequest,
  FetchTransportResult,
  RetailerCapabilities,
  RetailerIntelligenceProfile,
} from "./types";

export {
  getDefaultProxyProvider,
  setDefaultProxyProvider,
  listConfiguredProxyEndpoints,
  DirectProxyProvider,
} from "../transport/direct-proxy-provider";
export type { ProxyProvider, ProxyRouteMode, ProxySelection } from "../transport/proxy-provider";
