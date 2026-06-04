import { graphToRetrievalPayload } from "../ai/retrieval-payload";
import { buildPurchaseDecision } from "../decision/build-decision";
import { loadAllGraphs } from "../graph/store";
import { appendSnapshot, loadSnapshots, type DecisionSnapshot } from "./snapshots";

export interface DriftReport {
  evaluatedAt: string;
  canonicalsTracked: number;
  volatileCanonicals: string[];
  meanVolatility: number;
  confidenceDriftAlerts: Array<{
    canonicalId: string;
    priorIdentity: number;
    currentIdentity: number;
    delta: number;
  }>;
  unstableRegions: string[];
  notes: string[];
}

export function analyzeDriftAcrossCatalog(): DriftReport {
  const graphs = loadAllGraphs();
  const volatileCanonicals: string[] = [];
  const confidenceDriftAlerts: DriftReport["confidenceDriftAlerts"] = [];
  const unstableRegions: string[] = [];
  const notes: string[] = [];
  let volSum = 0;
  let volN = 0;

  for (const g of graphs) {
    const snaps = loadSnapshots(g.canonical.canonical_id);
    if (snaps.length < 2) continue;

    let changes = 0;
    for (let i = 1; i < Math.min(7, snaps.length); i++) {
      if (snaps[i]!.winnerOfferId !== snaps[i - 1]!.winnerOfferId) changes++;
    }
    const volatility = snaps.length > 1 ? changes / (Math.min(7, snaps.length) - 1) : 0;
    volSum += volatility;
    volN++;

    if (volatility >= 0.5) {
      volatileCanonicals.push(g.canonical.canonical_id);
      unstableRegions.push(
        `${g.canonical.title} (winner volatility ${Math.round(volatility * 100)}%)`,
      );
    }

    const prior = snaps[1]?.identityConfidence ?? snaps[0]!.identityConfidence;
    const identityDelta = g.identity_confidence.overall - prior;
    if (Math.abs(identityDelta) >= 0.1) {
      confidenceDriftAlerts.push({
        canonicalId: g.canonical.canonical_id,
        priorIdentity: prior,
        currentIdentity: g.identity_confidence.overall,
        delta: Math.round(identityDelta * 1000) / 1000,
      });
    }
  }

  if (volatileCanonicals.length) {
    notes.push(
      `${volatileCanonicals.length} product(s) show unstable winner selection — surface volatility in UX.`,
    );
  }
  if (confidenceDriftAlerts.length) {
    notes.push(
      `${confidenceDriftAlerts.length} product(s) with material identity confidence drift vs prior snapshot.`,
    );
  }

  return {
    evaluatedAt: new Date().toISOString(),
    canonicalsTracked: volN,
    volatileCanonicals,
    meanVolatility: volN ? Math.round((volSum / volN) * 1000) / 1000 : 0,
    confidenceDriftAlerts,
    unstableRegions,
    notes,
  };
}

export function recordSnapshotsForGraphs(): DecisionSnapshot[] {
  const recorded: DecisionSnapshot[] = [];
  for (const graph of loadAllGraphs()) {
    const retrieval = graphToRetrievalPayload(graph, graph.canonical.title);
    const decision = buildPurchaseDecision(graph, retrieval, { recordSnapshot: true });
    if (!decision) continue;
    recorded.push({
      at: new Date().toISOString(),
      canonicalId: graph.canonical.canonical_id,
      winnerOfferId: decision.winnerOfferId,
      winnerRetailer: decision.winnerRetailer,
      winnerPrice: decision.winnerPrice,
      compositeScore: decision.compositeScore,
      identityConfidence: graph.identity_confidence.overall,
      validatedOfferCount: graph.offers.filter((o) => o.validation_status === "validated").length,
      priceSpreadRatio: retrieval.consensus?.price_spread_ratio ?? 0,
    });
  }
  return recorded;
}
