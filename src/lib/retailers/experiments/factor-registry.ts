/**
 * Experiment factor registry + retailer presets.
 * Vary one factor at a time from a stable baseline.
 */
import type { RetailerId } from "../../types";
import type {
  ExperimentBaseline,
  ExperimentCellSpec,
  ExperimentFactorId,
  ExperimentPreset,
} from "./types";

const DEFAULT_WALMART_URL = "https://www.walmart.com/search?q=whole+milk";

export const EXPERIMENT_PRESETS: Record<string, ExperimentPreset> = {
  "walmart-challenge-factors": {
    id: "walmart-challenge-factors",
    retailerId: "walmart",
    label: "Walmart PerimeterX factor isolation",
    description:
      "One-factor-at-a-time matrix around a stable residential baseline. " +
      "Goal: correlate warmup, behavior, blocking, and session signals with PX challenges.",
    targetUrl: DEFAULT_WALMART_URL,
    baseline: {
      transport: "residential",
      behavior: "cold",
      warmup: false,
      waitStrategy: "adaptive",
      blockResources: ["image", "media", "font"],
      earlyExtraction: true,
      sticky: true,
      geoCountry: "us",
      viewport: "1366x900",
      sessionPersistence: false,
    },
    factorLevels: {
      warmup: ["false", "homepage", "simple"],
      behavior: ["cold", "humanized", "stealth_max"],
      waitStrategy: ["adaptive", "commit", "domcontentloaded"],
      blockResources: ["image,media,font", "none", "image,media,font,stylesheet"],
      earlyExtraction: ["true", "false"],
      sticky: ["true", "false"],
      viewport: ["1366x900", "1920x1080", "390x844"],
      sessionPersistence: ["false", "true"],
    },
    oneAtATime: true,
  },
  "walmart-warmup-focus": {
    id: "walmart-warmup-focus",
    retailerId: "walmart",
    label: "Walmart warmup A/B focus",
    targetUrl: DEFAULT_WALMART_URL,
    baseline: {
      transport: "residential",
      behavior: "cold",
      warmup: false,
      waitStrategy: "adaptive",
      blockResources: ["image", "media", "font"],
      earlyExtraction: true,
      sticky: true,
      geoCountry: "us",
    },
    factorLevels: {
      warmup: ["false", "homepage"],
    },
    oneAtATime: true,
  },
};

export function listExperimentPresets(retailerId?: RetailerId): ExperimentPreset[] {
  const all = Object.values(EXPERIMENT_PRESETS);
  return retailerId ? all.filter((p) => p.retailerId === retailerId) : all;
}

export function getExperimentPreset(id: string): ExperimentPreset | undefined {
  return EXPERIMENT_PRESETS[id];
}

function baselineValueForFactor(
  baseline: ExperimentBaseline,
  factor: ExperimentFactorId,
): string {
  switch (factor) {
    case "transport":
      return baseline.transport ?? "direct";
    case "behavior":
      return baseline.behavior ?? "cold";
    case "warmup":
      return String(baseline.warmup ?? false);
    case "waitStrategy":
      return baseline.waitStrategy ?? "adaptive";
    case "blockResources":
      return (baseline.blockResources ?? []).join(",") || "none";
    case "earlyExtraction":
      return String(baseline.earlyExtraction ?? true);
    case "sticky":
      return String(baseline.sticky ?? false);
    case "geoCountry":
      return baseline.geoCountry ?? "us";
    case "viewport":
      return baseline.viewport ?? "1366x900";
    case "sessionPersistence":
      return String(baseline.sessionPersistence ?? false);
    default:
      return "default";
  }
}

function parseOverrides(
  factor: ExperimentFactorId,
  value: string,
  baseline: ExperimentBaseline,
): ExperimentBaseline {
  const o: ExperimentBaseline = { ...baseline };
  switch (factor) {
    case "transport":
      o.transport = value as ExperimentBaseline["transport"];
      break;
    case "behavior":
      o.behavior = value as ExperimentBaseline["behavior"];
      break;
    case "warmup":
      o.warmup = value === "homepage" ? "homepage" : value === "simple" ? true : false;
      break;
    case "waitStrategy":
      o.waitStrategy = value as ExperimentBaseline["waitStrategy"];
      break;
    case "blockResources":
      o.blockResources =
        value === "none" ? [] : (value.split(",").filter(Boolean) as ExperimentBaseline["blockResources"]);
      break;
    case "earlyExtraction":
      o.earlyExtraction = value === "true";
      break;
    case "sticky":
      o.sticky = value === "true";
      break;
    case "geoCountry":
      o.geoCountry = value;
      break;
    case "viewport":
      o.viewport = value;
      break;
    case "sessionPersistence":
      o.sessionPersistence = value === "true";
      break;
  }
  return o;
}

/** Build OAT matrix: baseline cell + one cell per non-baseline factor level. */
export function buildOneAtATimeMatrix(preset: ExperimentPreset): ExperimentCellSpec[] {
  const cells: ExperimentCellSpec[] = [];
  const baseline = preset.baseline;

  cells.push({
    id: "baseline",
    factor: "transport",
    factorValue: baselineValueForFactor(baseline, "transport"),
    label: "baseline",
    overrides: { ...baseline },
    isBaseline: true,
  });

  for (const [factor, levels] of Object.entries(preset.factorLevels) as Array<
    [ExperimentFactorId, string[]]
  >) {
    const baseVal = baselineValueForFactor(baseline, factor);
    for (const level of levels ?? []) {
      if (level === baseVal) continue;
      const id = `${factor}=${level}`.replace(/[^a-z0-9=,_-]/gi, "_");
      cells.push({
        id,
        factor,
        factorValue: level,
        label: `${factor}→${level}`,
        overrides: parseOverrides(factor, level, baseline),
      });
    }
  }
  return cells;
}

export function baselineToFactorVector(b: ExperimentBaseline): Record<string, string> {
  return {
    transport: b.transport ?? "direct",
    behavior: b.behavior ?? "cold",
    warmup: String(b.warmup ?? false),
    waitStrategy: b.waitStrategy ?? "adaptive",
    blockResources: (b.blockResources ?? []).join(",") || "none",
    earlyExtraction: String(b.earlyExtraction ?? true),
    sticky: String(b.sticky ?? false),
    geoCountry: b.geoCountry ?? "us",
    viewport: b.viewport ?? "1366x900",
    sessionPersistence: String(b.sessionPersistence ?? false),
  };
}
