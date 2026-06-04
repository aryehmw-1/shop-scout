import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildRecommendationExplanation } from "../explain";
import { resolveIntelligenceForQuery, shouldUseIntelligenceMatch } from "../retrieval/resolve-for-query";
import type { ShoppingIntent } from "@/lib/types";

export interface GoldenQueryExpect {
  shouldMatch: boolean;
  canonicalIdIncludes?: string;
  minValidatedOffers?: number;
  mustIncludeRetailers?: string[];
  mustNotIncludeRetailers?: string[];
  minIdentityConfidence?: number;
  maxUncertaintyWarnings?: number;
  mustDetectFakeDiscount?: boolean;
  minExplanationScore?: number;
  mustHaveDecision?: boolean;
  minCounterfactuals?: number;
  minWhyThisWinsBullets?: number;
  winnerRetailer?: string;
  mustSurfaceVolatility?: boolean;
}

export interface GoldenQueryCase {
  id: string;
  query: string;
  intent?: Partial<ShoppingIntent>;
  expect: GoldenQueryExpect;
}

export interface GoldenCaseResult {
  id: string;
  query: string;
  passed: boolean;
  failures: string[];
  matched: boolean;
  canonicalId?: string;
  identityConfidence?: number;
  validatedOffers?: number;
  retailers?: string[];
  uncertaintyCount?: number;
  fakeDiscountCount?: number;
}

export interface GoldenSuiteReport {
  evaluatedAt: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  cases: GoldenCaseResult[];
  hallucinationResistance: {
    /** All matched cases only cite retailers present in graph */
    retailerGroundingPass: boolean;
  };
}

const GOLDEN_PATH = join(process.cwd(), "data", "eval", "golden-queries.json");

export function loadGoldenQueries(): GoldenQueryCase[] {
  if (!existsSync(GOLDEN_PATH)) return [];
  const raw = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as {
    cases: GoldenQueryCase[];
  };
  return raw.cases ?? [];
}

function explanationUsefulnessScore(
  explanation: ReturnType<typeof buildRecommendationExplanation>,
): number {
  let score = 0.4;
  if (explanation.trustSummary?.length > 20) score += 0.15;
  if (explanation.consensus && explanation.consensus.offerCount >= 2) score += 0.2;
  if (explanation.uncertainty.length) score += 0.1;
  if (explanation.bestValue) score += 0.15;
  return Math.min(1, score);
}

export function runGoldenSuite(): GoldenSuiteReport {
  const cases = loadGoldenQueries();
  const results: GoldenCaseResult[] = [];
  let retailerGroundingPass = true;

  for (const c of cases) {
    const failures: string[] = [];
    const { best } = resolveIntelligenceForQuery(c.query, c.intent, 1);
    const matched = shouldUseIntelligenceMatch(best);

    if (c.expect.shouldMatch && !matched) {
      failures.push("Expected intelligence match but none met threshold");
    }
    if (!c.expect.shouldMatch && matched) {
      failures.push("Expected no match (avoid false positive retrieval)");
    }

    let canonicalId: string | undefined;
    let identityConfidence: number | undefined;
    let validatedOffers: number | undefined;
    let retailers: string[] | undefined;
    let uncertaintyCount: number | undefined;
    let fakeDiscountCount: number | undefined;

    if (matched && best) {
      const graph = best.graph;
      canonicalId = graph.canonical.canonical_id;
      identityConfidence = graph.identity_confidence.overall;
      const validated = graph.offers.filter((o) => o.validation_status === "validated");
      validatedOffers = validated.length;
      retailers = validated.map((o) => o.retailer);

      const explanation = buildRecommendationExplanation(graph, best.retrieval, {
        recordDecisionSnapshot: false,
      });
      uncertaintyCount = explanation.uncertainty.length;
      fakeDiscountCount = explanation.fakeDiscountWarnings.length;

      if (c.expect.mustHaveDecision && !explanation.decision) {
        failures.push("decision: missing purchase decision");
      }
      if (explanation.decision) {
        const d = explanation.decision;
        if (!d.winnerRationale?.trim()) {
          failures.push("decision: missing winner rationale");
        }
        if (c.expect.minWhyThisWinsBullets != null && d.whyThisWins.length < c.expect.minWhyThisWinsBullets) {
          failures.push("decision: insufficient whyThisWins bullets");
        }
        if (c.expect.minCounterfactuals != null && d.counterfactuals.length < c.expect.minCounterfactuals) {
          failures.push(`decision: expected ≥${c.expect.minCounterfactuals} counterfactuals`);
        }
        if (c.expect.winnerRetailer && d.winnerRetailer !== c.expect.winnerRetailer) {
          failures.push(`decision: expected winner ${c.expect.winnerRetailer}, got ${d.winnerRetailer}`);
        }
        if (c.expect.mustSurfaceVolatility && !d.stability.volatile && !d.stability.note) {
          failures.push("decision: expected volatility signal");
        }
        if (d.reasoningTrace.length < 2) {
          failures.push("decision: reasoning trace too short");
        }
        const winnerInCandidates = d.candidates.some((x) => x.rank === 1 && x.offerId === d.winnerOfferId);
        if (!winnerInCandidates) {
          failures.push("decision: winner not ranked first in candidates");
        }
      }

      if (
        c.expect.canonicalIdIncludes &&
        !canonicalId.includes(c.expect.canonicalIdIncludes)
      ) {
        failures.push(
          `Expected canonical containing ${c.expect.canonicalIdIncludes}, got ${canonicalId}`,
        );
      }
      if (
        c.expect.minValidatedOffers != null &&
        validatedOffers < c.expect.minValidatedOffers
      ) {
        failures.push(
          `Expected ≥${c.expect.minValidatedOffers} validated offers, got ${validatedOffers}`,
        );
      }
      if (c.expect.minIdentityConfidence != null && identityConfidence < c.expect.minIdentityConfidence) {
        failures.push(
          `Identity confidence ${identityConfidence.toFixed(2)} below ${c.expect.minIdentityConfidence}`,
        );
      }
      for (const r of c.expect.mustIncludeRetailers ?? []) {
        if (!retailers.includes(r)) {
          failures.push(`Missing expected retailer: ${r}`);
        }
      }
      for (const r of c.expect.mustNotIncludeRetailers ?? []) {
        if (retailers.includes(r)) {
          failures.push(`Unexpected retailer present: ${r}`);
        }
      }
      if (
        c.expect.maxUncertaintyWarnings != null &&
        uncertaintyCount > c.expect.maxUncertaintyWarnings
      ) {
        failures.push(
          `Too many uncertainty warnings (${uncertaintyCount} > ${c.expect.maxUncertaintyWarnings})`,
        );
      }
      if (c.expect.mustDetectFakeDiscount === true && fakeDiscountCount < 1) {
        failures.push("Expected fake discount warning but none surfaced");
      }
      if (c.expect.minExplanationScore != null) {
        const es = explanationUsefulnessScore(explanation);
        if (es < c.expect.minExplanationScore) {
          failures.push(`Explanation score ${es.toFixed(2)} below minimum`);
        }
      }

      const citedRetailers = new Set([
        explanation.bestValue?.retailer,
        explanation.safestPurchase?.retailer,
        ...explanation.offerInsights.map((o) => o.retailerName),
      ].filter(Boolean) as string[]);

      for (const name of citedRetailers) {
        const found = validated.some(
          (o) => o.retailer_name === name || o.retailer === name,
        );
        if (!found) {
          retailerGroundingPass = false;
          failures.push(`Explanation cites retailer not in validated offers: ${name}`);
        }
      }
    }

    results.push({
      id: c.id,
      query: c.query,
      passed: failures.length === 0,
      failures,
      matched,
      canonicalId,
      identityConfidence,
      validatedOffers,
      retailers,
      uncertaintyCount,
      fakeDiscountCount,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    evaluatedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    cases: results,
    hallucinationResistance: { retailerGroundingPass },
  };
}
