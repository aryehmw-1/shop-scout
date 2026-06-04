/** Lightweight schema validation without external deps. */

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

export function validateJsonObject(
  raw: string,
  requiredKeys: string[],
): ValidationResult<Record<string, unknown>> {
  const errors: string[] = [];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, errors: ["invalid_json"] };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errors: ["not_object"] };
  }
  for (const k of requiredKeys) {
    if (!(k in parsed)) errors.push(`missing:${k}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: parsed, errors: [] };
}

export function repairJsonLike(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1]!.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/** Grounding check: ensure reply mentions only allowed retailer names. */
export function verifyRetailerGrounding(
  text: string,
  allowedRetailers: string[],
): ValidationResult<string> {
  const lower = text.toLowerCase();
  const knownChains = [
    "walmart",
    "target",
    "amazon",
    "costco",
    "kroger",
    "macys",
    "kohls",
    "nike",
    "gap",
    "aldi",
  ];
  const allowed = new Set(allowedRetailers.map((r) => r.toLowerCase()));
  const violations: string[] = [];
  for (const chain of knownChains) {
    if (lower.includes(chain) && !allowed.has(chain)) {
      violations.push(chain);
    }
  }
  if (violations.length) {
    return { ok: false, errors: violations.map((v) => `ungrounded_retailer:${v}`) };
  }
  return { ok: true, value: text, errors: [] };
}
