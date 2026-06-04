import type { CommerceIntelligenceGraph } from "../graph/types";
import { loadAllGraphs, saveGraph } from "../graph/store";

const STALE_MS = 14 * 86400000;

export interface StaleCleanupReport {
  graphsProcessed: number;
  offersRemoved: number;
  evidenceRemoved: number;
}

/** Remove expired/stale offers and orphaned evidence from persisted graphs. */
export function cleanupStaleGraphData(): StaleCleanupReport {
  const graphs = loadAllGraphs();
  let offersRemoved = 0;
  let evidenceRemoved = 0;
  const now = Date.now();

  for (const graph of graphs) {
    const beforeOffers = graph.offers.length;
    graph.offers = graph.offers.filter((o) => {
      if (o.freshness_tier === "expired") return false;
      if (o.expires_at && new Date(o.expires_at).getTime() < now) return false;
      if (o.validation_status === "rejected") {
        const ref = o.provenance?.fetched_at;
        if (ref) {
          const age = now - new Date(ref).getTime();
          if (age > STALE_MS) return false;
        }
      }
      return true;
    });
    const removedOffers = beforeOffers - graph.offers.length;
    offersRemoved += removedOffers;

    const offerIds = new Set(graph.offers.map((o) => o.offer_id));
    const beforeEv = graph.evidence.length;
    graph.evidence = graph.evidence.filter((e) => {
      const ref = e.payload?.offer_id;
      if (typeof ref === "string" && !offerIds.has(ref)) return false;
      const age = now - new Date(e.created_at).getTime();
      if (age > STALE_MS * 2) return false;
      return true;
    });
    const removedEv = beforeEv - graph.evidence.length;
    evidenceRemoved += removedEv;

    if (removedOffers > 0 || removedEv > 0) {
      graph.updated_at = new Date().toISOString();
      saveGraph(graph);
    }
  }

  return {
    graphsProcessed: graphs.length,
    offersRemoved,
    evidenceRemoved,
  };
}
