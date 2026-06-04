import type { CommerceRetrievalPayload } from "./retrieval-payload";

/**
 * Compact, deterministic summary for LLM context — no HTML, no raw snippets.
 */
export function summarizeRetrievalPayload(payload: CommerceRetrievalPayload): string {
  const lines: string[] = [];

  lines.push(
    `CANONICAL PRODUCT: ${payload.canonical.title}` +
      (payload.canonical.brand ? ` (${payload.canonical.brand})` : ""),
  );
  lines.push(
    `Identity confidence: ${(payload.canonical.identity_confidence * 100).toFixed(0)}%` +
      (payload.canonical.identity_reasons.length ?
        ` — ${payload.canonical.identity_reasons.slice(0, 3).join("; ")}`
      : ""),
  );

  if (payload.consensus) {
    const c = payload.consensus;
    lines.push(
      `Consensus pricing (${c.offer_count} offers): $${c.min_price.toFixed(2)} – $${c.max_price.toFixed(2)}, median $${c.median_price.toFixed(2)}, spread ${(c.price_spread_ratio * 100).toFixed(0)}%`,
    );
    if (c.price_spread_ratio > 0.35) {
      lines.push("⚠ Price spread is high — mention uncertainty when recommending.");
    }
  }

  lines.push("VALIDATED OFFERS (use ONLY these prices and retailers):");
  for (const o of payload.offers.slice(0, 12)) {
    const conf = (o.confidence * 100).toFixed(0);
    const reasons =
      o.confidence_reasons.length ? ` [${o.confidence_reasons.slice(0, 2).join("; ")}]` : "";
    lines.push(
      `- ${o.retailer}: $${o.price.toFixed(2)} (${o.availability}, confidence ${conf}%, source ${o.source}, ${o.freshness})${reasons}`,
    );
  }

  if (payload.evidence_summary.length) {
    lines.push(`Evidence: ${payload.evidence_summary.slice(0, 6).join(" · ")}`);
  }

  lines.push(
    "POLICY: Cite confidence and evidence. Do not invent prices. Flag low-confidence offers. Disclose uncertainty when spread is high.",
  );

  return lines.join("\n");
}
