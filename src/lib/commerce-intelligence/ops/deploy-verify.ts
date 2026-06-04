import { buildLaunchAlerts } from "./launch-alerts";
import { validateProductionConfig } from "./production-config";
import { getLaunchFlagsSnapshot } from "./feature-flags";
import { launchFlags } from "./feature-flags";
import { intelligenceRecommend } from "../service/intelligence-api";
import { verifyCriticalModulesExist } from "./module-integrity";
import { assessCanonicalCatalogHealth } from "@/lib/demo-commerce/canonical/catalog-health";
import { assessRuntimeSafety } from "./runtime-safety";

export interface DeployVerificationReport {
  at: string;
  ready: boolean;
  config: ReturnType<typeof validateProductionConfig>;
  flags: ReturnType<typeof getLaunchFlagsSnapshot>;
  alerts: ReturnType<typeof buildLaunchAlerts>;
  modules: { ok: boolean; missing: string[] };
  catalog: ReturnType<typeof assessCanonicalCatalogHealth>;
  runtime: Pick<ReturnType<typeof assessRuntimeSafety>, "ok" | "checks">;
  smoke: {
    healthOk: boolean;
    recommendOk: boolean;
    deterministicFallback: boolean;
  };
}

/** Pre/post deploy checklist — no external deps. */
export function runDeployVerification(): DeployVerificationReport {
  const config = validateProductionConfig();
  const alerts = buildLaunchAlerts();
  const critical = alerts.some((a) => a.severity === "critical");

  let recommendOk = false;
  try {
    intelligenceRecommend("coffee maker", { query: "coffee maker" });
    recommendOk = true;
  } catch {
    recommendOk = false;
  }

  const rec2 = intelligenceRecommend("xyzzy_nonexistent_product_12345", {
    query: "xyzzy_nonexistent_product_12345",
  });
  const ambiguousHandled = !rec2.matched;

  const modules = verifyCriticalModulesExist();
  const catalog = assessCanonicalCatalogHealth();
  const runtime = assessRuntimeSafety();
  const requireCatalog =
    process.env.REQUIRE_CANONICAL_CATALOG === "1" || process.env.NEXT_PUBLIC_BETA_MODE === "1";

  return {
    at: new Date().toISOString(),
    ready:
      config.valid &&
      !critical &&
      recommendOk &&
      modules.ok &&
      runtime.ok &&
      (!requireCatalog || catalog.demoReady),
    config,
    flags: getLaunchFlagsSnapshot(),
    alerts,
    modules,
    catalog,
    runtime: { ok: runtime.ok, checks: runtime.checks },
    smoke: {
      healthOk: config.valid,
      recommendOk,
      deterministicFallback: ambiguousHandled || launchFlags.safeMode,
    },
  };
}
