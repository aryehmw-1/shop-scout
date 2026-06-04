import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadAllGraphs } from "../graph/store";
import { buildEvalReport, type IntelligenceEvalReport } from "./metrics";
import { intelligenceGraphDir } from "../storage-root";

export function runIntelligenceEval(): IntelligenceEvalReport {
  const graphs = loadAllGraphs();
  return buildEvalReport(graphs);
}

export function runIntelligenceEvalAndSave(): IntelligenceEvalReport {
  const report = runIntelligenceEval();
  const dir = intelligenceGraphDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "eval-report.json"), JSON.stringify(report, null, 2));
  return report;
}
