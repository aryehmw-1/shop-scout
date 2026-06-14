import "server-only";

// Persist match decisions for admin review + feedback. Every non-DIFFERENT
// decision is stored; an admin's approve/reject sets `adminOverride`, which then
// becomes the source of truth for that pair on future classifications.

import { prisma } from "../db/prisma";
import { classifyProductPair, type MatchDecision, type MatchResult } from "./classify";
import type { NormalizedListing } from "../pipeline/types";

/** Stable, order-independent key for a product pair. */
export function pairKeyFor(
  a: NormalizedListing,
  b: NormalizedListing,
  idA?: string,
  idB?: string,
): string {
  const ka = (idA || a.titleNormalized || a.title || "").toLowerCase();
  const kb = (idB || b.titleNormalized || b.title || "").toLowerCase();
  return [ka, kb].sort().join("::");
}

/** Look up an admin-confirmed decision for a pair, if any. */
export async function getOverride(pairKey: string): Promise<MatchDecision | undefined> {
  const row = await prisma.productMatchDecision.findUnique({
    where: { pairKey },
    select: { adminOverride: true },
  });
  return (row?.adminOverride as MatchDecision | null) ?? undefined;
}

/**
 * Classify a pair (honoring any admin override) and persist the decision.
 * DIFFERENT results are not stored (they'd flood the table). Best-effort: a
 * storage failure never breaks the caller.
 */
export async function classifyAndRecord(
  a: NormalizedListing,
  b: NormalizedListing,
  opts: { idA?: string; idB?: string; store?: boolean } = {},
): Promise<MatchResult> {
  const pairKey = pairKeyFor(a, b, opts.idA, opts.idB);
  let override: MatchDecision | undefined;
  try {
    override = await getOverride(pairKey);
  } catch {
    /* ignore lookup errors */
  }

  const result = classifyProductPair(a, b, override);

  if (opts.store !== false && result.decision !== "DIFFERENT") {
    try {
      await prisma.productMatchDecision.upsert({
        where: { pairKey },
        // Don't clobber an existing admin review; just refresh the machine fields.
        update: {
          decision: result.decision,
          confidence: result.confidence,
          method: result.method,
          reasonsJson: JSON.stringify(result.reasons),
        },
        create: {
          pairKey,
          productAId: opts.idA ?? null,
          productBId: opts.idB ?? null,
          titleA: a.title ?? "",
          titleB: b.title ?? "",
          decision: result.decision,
          confidence: result.confidence,
          method: result.method,
          reasonsJson: JSON.stringify(result.reasons),
        },
      });
    } catch (e) {
      console.error("[matching] record failed", e);
    }
  }

  return result;
}
