import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadAllGraphs } from "../graph/store";
import { buildEvalReport, type IntelligenceEvalReport } from "./metrics";

export function runIntelligenceEval(): IntelligenceEvalReport {
  const graphs = loadAllGraphs();
  return buildEvalReport(graphs);
}

export function runIntelligenceEvalAndSave(): IntelligenceEvalReport {
  const report = runIntelligenceEval();
  const dir = join(process.cwd(), "data", "intelligence-graph");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "eval-report.json"), JSON.stringify(report, null, 2));
  return report;
}
