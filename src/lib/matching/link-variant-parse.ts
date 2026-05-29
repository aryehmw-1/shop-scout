import { normalizeColor, normalizeSizeLabel } from "../catalog/size-normalize";

export interface ParsedLinkVariant {
  color?: string;
  size?: string;
  packCount?: number;
  volumeOz?: number;
  volumeLb?: number;
  storageGb?: number;
  count?: number;
}

/** Extract variant attributes from product title / slug for equivalence checks. */
export function parseVariantFromTitle(title: string): ParsedLinkVariant {
  const lower = title.toLowerCase();
  const out: ParsedLinkVariant = {};

  const colorMatch = lower.match(
    /\b(black|white|navy|blue|red|green|gray|grey|brown|pink|beige|olive|charcoal|burgundy|purple|yellow|orange|tan|cream|silver|gold)\b/i,
  );
  if (colorMatch) out.color = normalizeColor(colorMatch[1]!);

  const packMatch = lower.match(/\b(\d+)\s*[- ]?\s*(pack|pk|count|ct)\b/i);
  if (packMatch) out.packCount = parseInt(packMatch[1]!, 10);

  const ozMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*oz\b/i);
  if (ozMatch) out.volumeOz = parseFloat(ozMatch[1]!);

  const lbMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*lb\b/i);
  if (lbMatch) out.volumeLb = parseFloat(lbMatch[1]!);

  const gbMatch = lower.match(/\b(\d+)\s*gb\b/i);
  if (gbMatch) out.storageGb = parseInt(gbMatch[1]!, 10);

  const sizeMatch = title.match(
    /\b(size\s+)?(\d{1,2}x\d{1,2}|\d{1,2}\s*\/\s*\d{1,2}|xs|s|m|l|xl|xxl|2xl|3xl|\d{1,2}(?:\.\d)?)\b/i,
  );
  if (sizeMatch && !packMatch && !ozMatch && !gbMatch) {
    out.size = normalizeSizeLabel(sizeMatch[0]!);
  }

  if (out.packCount) out.count = out.packCount;

  return out;
}

export function variantAttributesConflict(
  a: ParsedLinkVariant,
  b: ParsedLinkVariant,
): { conflict: boolean; reason?: string } {
  if (a.color && b.color && a.color !== b.color) {
    return { conflict: true, reason: `color mismatch (${a.color} vs ${b.color})` };
  }
  if (a.size && b.size && a.size !== b.size) {
    return { conflict: true, reason: `size mismatch (${a.size} vs ${b.size})` };
  }
  if (a.packCount && b.packCount && a.packCount !== b.packCount) {
    return { conflict: true, reason: `pack count mismatch (${a.packCount} vs ${b.packCount})` };
  }
  if (a.volumeOz && b.volumeOz && Math.abs(a.volumeOz - b.volumeOz) > 0.5) {
    return { conflict: true, reason: `volume mismatch (${a.volumeOz}oz vs ${b.volumeOz}oz)` };
  }
  if (a.storageGb && b.storageGb && a.storageGb !== b.storageGb) {
    return { conflict: true, reason: `storage mismatch (${a.storageGb}GB vs ${b.storageGb}GB)` };
  }
  return { conflict: false };
}
