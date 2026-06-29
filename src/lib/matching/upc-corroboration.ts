// UPC-stamp corroboration (Priority 5 safety gate).
//
// When a competitor `upc_lookup` returns a product row that does NOT echo a
// barcode, we may stamp the QUERIED upc onto it so it links to the known-good
// source product — but ONLY when the row is strongly corroborated as the SAME
// item. A wrong stamp would merge two different products and show the wrong
// price, so this gate is deliberately conservative and explains every decision.
//
// Accept requires ALL of:
//   • no conflicting barcode (a different barcode on the row → never the same item)
//   • brand match (normalized) when both carry a brand
//   • strong title overlap (shared core product nouns)
//   • size/unit/count compatible when both are sized
//   • the row is not a bundle / kit / variety pack / sampler, and refill status
//     matches the source (a refill is a different SKU than the base product)

import { normalizeBrand } from "../pipeline/normalize";
import { parseSizes, coreTokens, type ProductIdentity } from "./cross-retailer-key";

export interface CorroborationParty {
  brand?: string | null;
  title?: string | null;
  /** Size label or the title (we also mine the title for size tokens). */
  sizeLabel?: string | null;
  /** Cleaned 8–14 digit barcode if the party carries one. */
  barcode?: string | null;
}

export interface CorroborationResult {
  accept: boolean;
  reasons: string[];
}

/** "Different product" markers — a returned row matching these is a bundle/kit/
 *  variety pack rather than the single item we searched for. */
const BUNDLE_RE = /\b(bundle|variety\s*pack|assorted|sampler|gift\s*set|combo|multipack\s+of\s+\d+\s+\w+\s+and)\b/i;
const KIT_RE = /\b(kit|starter\s*set|gift\s*set)\b/i;
const REFILL_RE = /\b(refill|refills)\b/i;

function identity(p: CorroborationParty): ProductIdentity {
  return { brand: p.brand, title: p.title, sizeLabel: p.sizeLabel ?? p.title };
}

/** Both sized → every shared dimension must agree within 1.4× (mirrors the linker
 *  `sizesCompatible`). Missing sizes don't block (title/brand carry the match). */
function sizesCompatible(a: ProductIdentity, b: ProductIdentity): boolean {
  const sa = parseSizes(a);
  const sb = parseSizes(b);
  const unitsA = Object.keys(sa);
  const unitsB = Object.keys(sb);
  let shared = 0;
  for (const unit of unitsA) {
    if (sb[unit] === undefined) continue;
    shared++;
    const hi = Math.max(sa[unit], sb[unit]);
    const lo = Math.min(sa[unit], sb[unit]);
    if (lo <= 0 || hi / lo > 1.4) return false;
  }
  if (unitsA.length > 0 && unitsB.length > 0 && shared === 0) return false;
  return true;
}

/** Decide whether the competitor row (`cand`) is the SAME item as the known-good
 *  `source` and may therefore inherit the source's barcode. */
export function corroborateUpcStamp(
  source: CorroborationParty,
  cand: CorroborationParty,
): CorroborationResult {
  const reasons: string[] = [];

  // 1. Conflicting barcode → categorically different item.
  if (cand.barcode && source.barcode && cand.barcode !== source.barcode) {
    return { accept: false, reasons: [`conflicting barcode ${cand.barcode} ≠ ${source.barcode}`] };
  }

  // 2. Brand must match when both carry one.
  const sb = normalizeBrand(source.brand);
  const cb = normalizeBrand(cand.brand);
  if (sb && cb) {
    if (sb !== cb) return { accept: false, reasons: [`brand mismatch ${cb} ≠ ${sb}`] };
    reasons.push(`brand=${cb}`);
  } else {
    reasons.push("brand: one side missing (relying on title)");
  }

  // 3. Bundle / kit / variety / sampler — reject unless the source is the same kind.
  const candTitle = cand.title ?? "";
  const srcTitle = source.title ?? "";
  if (BUNDLE_RE.test(candTitle) && !BUNDLE_RE.test(srcTitle)) {
    return { accept: false, reasons: ["row is a bundle/variety pack"] };
  }
  if (KIT_RE.test(candTitle) && !KIT_RE.test(srcTitle)) {
    return { accept: false, reasons: ["row is a kit/gift set"] };
  }
  if (REFILL_RE.test(candTitle) !== REFILL_RE.test(srcTitle)) {
    return { accept: false, reasons: ["refill status differs (different SKU)"] };
  }

  // 4. Strong title overlap on core product nouns.
  const sTok = coreTokens(identity(source), 6);
  const cTok = coreTokens(identity(cand), 6);
  const shared = sTok.filter((t) => cTok.includes(t));
  const minLen = Math.min(sTok.length, cTok.length);
  const strongTitle =
    shared.length >= 2 || (shared.length >= 1 && minLen <= 2 && minLen > 0);
  if (!strongTitle) {
    return {
      accept: false,
      reasons: [`weak title overlap (${shared.length} shared: ${shared.join(",") || "none"})`],
    };
  }
  reasons.push(`title overlap=${shared.length} (${shared.join(",")})`);

  // 5. Size/unit/count compatible where both are sized.
  if (!sizesCompatible(identity(source), identity(cand))) {
    return { accept: false, reasons: [...reasons, "size/count mismatch"] };
  }
  reasons.push("size compatible");

  return { accept: true, reasons };
}
