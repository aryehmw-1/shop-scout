import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateProductionConfig } from "./production-config";
import { launchFlags } from "./feature-flags";
import type { RegressionGateReport } from "../eval/regression-gates";
import { intelligenceGraphDir } from "../storage-root";

export type AlertSeverity = "info" | "warning" | "critical";

export interface LaunchAlert {
  id: string;
  severity: AlertSeverity;
  message: string;
  action?: string;
}

function readRegressionGates(): RegressionGateReport | null {
  const p = join(intelligenceGraphDir(), "regression-gates.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as RegressionGateReport;
  } catch {
    return null;
  }
}

/** Human-readable alerts for operators — not paging integrations yet. */
export function buildLaunchAlerts(): LaunchAlert[] {
  const alerts: LaunchAlert[] = [];
  const config = validateProductionConfig();

  if (!config.valid) {
    for (const e of config.errors) {
      alerts.push({ id: "config_error", severity: "critical", message: e, action: "Fix env before deploy" });
    }
  }

  for (const w of config.warnings) {
    alerts.push({ id: `config_${w.slice(0, 24)}`, severity: "warning", message: w });
  }

  if (launchFlags.safeMode) {
    alerts.push({
      id: "safe_mode",
      severity: "info",
      message: "INTELLIGENCE_SAFE_MODE=1 — LLM augmentation disabled; deterministic core only.",
    });
  }

  const gates = readRegressionGates();
  if (gates && !gates.passed) {
    for (const g of gates.gates.filter((x) => !x.passed)) {
      alerts.push({
        id: `gate_${g.id}`,
        severity: "critical",
        message: `Regression gate failed: ${g.description} (${g.detail})`,
        action: "Run npm run demo:eval-intelligence",
      });
    }
  }

  if (!existsSync(join(intelligenceGraphDir(), "index.json"))) {
    alerts.push({
      id: "no_graph_index",
      severity: "warning",
      message: "No intelligence graph index — run Impact ingest or seed graphs.",
      action: "npm run demo:impact-ingest",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all_clear",
      severity: "info",
      message: "No active launch alerts. Deterministic core and last eval gates look healthy.",
    });
  }

  return alerts;
}
