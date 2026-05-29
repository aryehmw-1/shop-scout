/** Lightweight A/B experiment flags — env override or stable anonymous assignment. */

export type ExperimentId =
  | "best_deal_banner"
  | "savings_copy"
  | "trust_placement"
  | "explain_ux"
  | "compare_layout";

export type ExperimentVariant<T extends ExperimentId> =
  T extends "best_deal_banner" ? "hero" | "compact"
  : T extends "savings_copy" ? "percent" | "dollar"
  : T extends "trust_placement" ? "badge" | "inline"
  : T extends "explain_ux" ? "open" | "collapsed"
  : T extends "compare_layout" ? "table" | "cards"
  : string;

const DEFAULTS: Record<ExperimentId, string> = {
  best_deal_banner: "hero",
  savings_copy: "percent",
  trust_placement: "badge",
  explain_ux: "collapsed",
  compare_layout: "cards",
};

const VARIANTS: Record<ExperimentId, string[]> = {
  best_deal_banner: ["hero", "compact"],
  savings_copy: ["percent", "dollar"],
  trust_placement: ["badge", "inline"],
  explain_ux: ["open", "collapsed"],
  compare_layout: ["table", "cards"],
};

const ANON_KEY = "shop-scout:anon-id";

function anonId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = `a_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

function hashPick(seed: string, options: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length]!;
}

export function getExperimentVariant(id: ExperimentId): string {
  const envKey = `NEXT_PUBLIC_EXP_${id.toUpperCase()}`;
  const fromEnv =
    typeof process !== "undefined" ?
      process.env[envKey]?.trim()
    : undefined;
  if (fromEnv && VARIANTS[id].includes(fromEnv)) return fromEnv;

  if (typeof window !== "undefined") {
    const override = localStorage.getItem(`exp:${id}`);
    if (override && VARIANTS[id].includes(override)) return override;
  }

  return hashPick(`${anonId()}:${id}`, VARIANTS[id]) ?? DEFAULTS[id];
}

export function allExperimentVariants(): Record<ExperimentId, string> {
  return {
    best_deal_banner: getExperimentVariant("best_deal_banner"),
    savings_copy: getExperimentVariant("savings_copy"),
    trust_placement: getExperimentVariant("trust_placement"),
    explain_ux: getExperimentVariant("explain_ux"),
    compare_layout: getExperimentVariant("compare_layout"),
  };
}

export function setExperimentOverride(id: ExperimentId, variant: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`exp:${id}`, variant);
}
