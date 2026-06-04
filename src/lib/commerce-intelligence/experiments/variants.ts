export type ExperimentKey =
  | "trust_summary_style"
  | "trust_framing"
  | "uncertainty_tone"
  | "onboarding_copy"
  | "ranking_personalization"
  | "analyst_depth"
  | "llm_escalation";

export type Variant = "control" | "a" | "b";

/** Deterministic bucket — browser-safe (no node:crypto). */
function fnv1aFirstByte(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h & 0xff;
}

function readForcedVariant(key: ExperimentKey): Variant | null {
  const suffix = key.toUpperCase();
  const candidates = [
    process.env[`EXPERIMENT_${suffix}`],
    process.env[`NEXT_PUBLIC_EXPERIMENT_${suffix}`],
  ];
  for (const forced of candidates) {
    if (forced === "control" || forced === "a" || forced === "b") return forced;
  }
  return null;
}

function hashToVariant(seed: string, key: ExperimentKey): Variant {
  const forced = readForcedVariant(key);
  if (forced) return forced;

  const bucket = fnv1aFirstByte(`${key}:${seed}`) % 3;
  if (bucket === 0) return "control";
  if (bucket === 1) return "a";
  return "b";
}

/** Lightweight A/B — env override or deterministic bucket from seed (session/canonical). */
export function getExperimentVariant(
  key: ExperimentKey,
  seed = "global",
): Variant {
  return hashToVariant(seed, key);
}

export function isExperimentEnabled(): boolean {
  const off =
    typeof window !== "undefined" ?
      process.env.NEXT_PUBLIC_INTELLIGENCE_EXPERIMENTS === "0"
    : process.env.INTELLIGENCE_EXPERIMENTS === "0";
  return !off;
}
