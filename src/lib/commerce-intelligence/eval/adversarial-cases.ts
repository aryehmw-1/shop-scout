import { buildIntelligenceGraph } from "../confidence/compute";
import { graphToRetrievalPayload } from "../ai/retrieval-payload";
import { buildRecommendationExplanation } from "../explain";
import { loadAllGraphs } from "../graph/store";
import { mapGraphToDemoCanonical } from "../graph/map-to-demo";
import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";

export interface AdversarialCaseResult {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface AdversarialSuiteReport {
  evaluatedAt: string;
  total: number;
  passed: number;
  cases: AdversarialCaseResult[];
}

function explainFromCanonical(canonical: CanonicalProduct, query: string) {
  const g = buildIntelligenceGraph(canonical);
  const r = graphToRetrievalPayload(g, query);
  return buildRecommendationExplanation(g, r);
}

/** Synthetic edge cases — deterministic, no LLM. */
export function runAdversarialSuite(): AdversarialSuiteReport {
  const graphs = loadAllGraphs();
  const cases: AdversarialCaseResult[] = [];

  if (!graphs.length) {
    return {
      evaluatedAt: new Date().toISOString(),
      total: 1,
      passed: 0,
      cases: [
        {
          id: "graphs_present",
          description: "At least one intelligence graph for adversarial tests",
          passed: false,
          detail: "No graphs loaded",
        },
      ],
    };
  }

  const base = mapGraphToDemoCanonical(graphs[0]!);

  try {
    const ex = explainFromCanonical(
      { ...base, canonical_title: `${base.canonical_title}  ` },
      base.canonical_title,
    );
    cases.push({
      id: "near_duplicate_title",
      description: "Whitespace-padded title does not crash explanation",
      passed: Boolean(ex.headline && ex.trustSummary),
      detail: ex.headline,
    });
  } catch (e) {
    cases.push({
      id: "near_duplicate_title",
      description: "Whitespace-padded title does not crash explanation",
      passed: false,
      detail: String(e),
    });
  }

  try {
    const offers = base.offers.map((o, i) =>
      i === 0 ? { ...o, price: 0.01 } : o,
    );
    const ex = explainFromCanonical({ ...base, offers }, "price anomaly");
    const warned =
      ex.uncertainty.some((u) => u.level === "warning") ||
      ex.fakeDiscountWarnings.length > 0 ||
      (ex.adaptive?.marketSignals.length ?? 0) > 0;
    cases.push({
      id: "extreme_pricing",
      description: "Extreme price spread surfaces uncertainty or market signals",
      passed: warned,
      detail: `${ex.uncertainty.length} uncertainty, ${ex.adaptive?.marketSignals.length ?? 0} market signals`,
    });
  } catch (e) {
    cases.push({
      id: "extreme_pricing",
      description: "Extreme price spread surfaces uncertainty or market signals",
      passed: false,
      detail: String(e),
    });
  }

  try {
    const ex = explainFromCanonical(base, "sparse");
    cases.push({
      id: "sparse_evidence",
      description: "Minimal query still produces bounded explanation",
      passed: ex.evidence.count >= 0 && ex.identity.overall >= 0,
      detail: `evidence=${ex.evidence.count} identity=${ex.identity.overall}`,
    });
  } catch (e) {
    cases.push({
      id: "sparse_evidence",
      description: "Minimal query still produces bounded explanation",
      passed: false,
      detail: String(e),
    });
  }

  try {
    const ex = explainFromCanonical(
      { ...base, canonical_title: "FREE iPhone 15 Pro Max 100% OFF" },
      "iphone",
    );
    cases.push({
      id: "manipulated_title",
      description: "Spammy title still yields structured output",
      passed: typeof ex.productTitle === "string",
      detail: ex.productTitle.slice(0, 60),
    });
  } catch (e) {
    cases.push({
      id: "manipulated_title",
      description: "Spammy title still yields structured output",
      passed: false,
      detail: String(e),
    });
  }

  try {
    const single = explainFromCanonical({ ...base, offers: base.offers.slice(0, 1) }, "single offer");
    cases.push({
      id: "single_validated_offer",
      description: "Single-offer graph still produces decision or clear uncertainty",
      passed: Boolean(single.trustSummary) && (single.decision != null || single.uncertainty.length > 0),
      detail: single.decision ? "has decision" : `${single.uncertainty.length} uncertainty`,
    });
  } catch (e) {
    cases.push({
      id: "single_validated_offer",
      description: "Single-offer graph still produces decision or clear uncertainty",
      passed: false,
      detail: String(e),
    });
  }

  try {
    const offers = base.offers.map((o, i) => ({
      ...o,
      store_title: i === 0 ? "Totally Different Unrelated Product XYZ" : o.store_title,
    }));
    const ex = explainFromCanonical({ ...base, offers }, base.canonical_title);
    cases.push({
      id: "conflicting_titles",
      description: "Conflicting retailer titles do not crash explanation pipeline",
      passed: Boolean(ex.headline) && ex.identity.overall >= 0,
      detail: `identity=${ex.identity.overall}`,
    });
  } catch (e) {
    cases.push({
      id: "conflicting_titles",
      description: "Conflicting retailer titles do not crash explanation pipeline",
      passed: false,
      detail: String(e),
    });
  }

  try {
    const ex = explainFromCanonical(base, base.canonical_title);
    const retailers = new Set(ex.offerInsights.map((o) => o.retailer));
    const hallucinated = ex.offerInsights.some((o) => !base.offers.some((b) => b.retailer === o.retailer));
    cases.push({
      id: "retailer_grounding",
      description: "Offer insights only cite retailers present in graph",
      passed: !hallucinated && retailers.size <= base.offers.length,
      detail: `${retailers.size} retailers cited`,
    });
  } catch (e) {
    cases.push({
      id: "retailer_grounding",
      description: "Offer insights only cite retailers present in graph",
      passed: false,
      detail: String(e),
    });
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    evaluatedAt: new Date().toISOString(),
    total: cases.length,
    passed,
    cases,
  };
}
