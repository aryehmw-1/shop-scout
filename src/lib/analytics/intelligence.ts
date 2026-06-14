import "server-only";

// User-intelligence recorder. Mirrors high-value analytics events into dedicated,
// query-friendly tables (SearchEvent / ProductClick / MissingProduct) on top of
// the lightweight LearningEvent log. Best-effort: failures are swallowed so
// analytics can never break a user-facing request.

import { prisma } from "../db/prisma";
import type { AnalyticsEvent } from "./events";

interface Ctx {
  userId?: string;
  sessionId?: string;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Route an analytics event into the dedicated intelligence tables. Only the
 * user-intelligence event names produce rows; everything else is a no-op here
 * (it still lands in LearningEvent via the main recorder).
 */
export async function recordIntelligence(
  event: AnalyticsEvent,
  ctx: Ctx,
): Promise<void> {
  const p = event.properties ?? {};
  const sessionId = ctx.sessionId ?? str(event.sessionId);
  const base = { sessionId, userId: ctx.userId };

  try {
    switch (event.name) {
      // SearchEvent is written when RESULTS are known (search_first_results
      // carries offerCount), or when a search_performed explicitly includes a
      // resultsCount (e.g. the compare page). The chat's submit-time
      // search_performed has no count and is intentionally skipped here so it
      // doesn't get mis-recorded as a zero-result search.
      case "search_performed":
        if (p.resultsCount === undefined) return;
      // falls through
      case "search_first_results": {
        const query = str(p.query);
        if (!query) return;
        const resultsCount = num(p.resultsCount ?? p.offerCount) ?? 0;
        const category = str(p.category);
        await prisma.searchEvent.create({
          data: {
            query,
            queryNormalized: str(p.queryNormalized) ?? query.toLowerCase(),
            resultsCount,
            category,
            pageUrl: str(p.pageUrl ?? p.path),
            ...base,
          },
        });
        // Zero results → demand we don't yet serve.
        if (resultsCount === 0) {
          await prisma.missingProduct.create({
            data: {
              query,
              queryNormalized: str(p.queryNormalized) ?? query.toLowerCase(),
              category,
              ...base,
            },
          });
        }
        return;
      }
      case "product_clicked":
      case "retailer_clicked": {
        await prisma.productClick.create({
          data: {
            productId: str(p.productId),
            retailer: str(p.retailer),
            kind: event.name === "retailer_clicked" ? "retailer" : "product",
            query: str(p.query),
            category: str(p.category),
            ...base,
          },
        });
        return;
      }
      default:
        return;
    }
  } catch (e) {
    console.error("[analytics.intelligence] write failed", event.name, e);
  }
}
