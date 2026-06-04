import type { CommerceIntelligenceGraph } from "../graph/types";
import { loadPublishedGraphs } from "../graph/store";

const TTL_MS = Number(process.env.INTELLIGENCE_GRAPH_CACHE_MS ?? "30000");

let cache: { at: number; minIdentity: number; graphs: CommerceIntelligenceGraph[] } | null = null;

export function getPublishedGraphsCached(minIdentity = 0.45): CommerceIntelligenceGraph[] {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS && cache.minIdentity === minIdentity) {
    return cache.graphs;
  }
  const graphs = loadPublishedGraphs(minIdentity);
  cache = { at: now, minIdentity, graphs };
  return graphs;
}

export function invalidatePublishedGraphCache(): void {
  cache = null;
}
