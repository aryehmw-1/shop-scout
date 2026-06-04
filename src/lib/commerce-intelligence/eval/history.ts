import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface EvalHistoryEntry {
  at: string;
  calibrationScore: number;
  goldenPassRate: number;
  meanIdentityConfidence: number;
  falsePositiveCount: number;
  graphCount: number;
}

export interface EvalHistoryFile {
  version: 1;
  entries: EvalHistoryEntry[];
}

const HISTORY_PATH = join(process.cwd(), "data", "intelligence-graph", "calibration-history.json");
const MAX_ENTRIES = 120;

export function loadEvalHistory(): EvalHistoryFile {
  if (!existsSync(HISTORY_PATH)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf8")) as EvalHistoryFile;
  } catch {
    return { version: 1, entries: [] };
  }
}

export function appendEvalHistory(entry: EvalHistoryEntry): EvalHistoryFile {
  const file = loadEvalHistory();
  file.entries = [entry, ...file.entries].slice(0, MAX_ENTRIES);
  mkdirSync(join(process.cwd(), "data", "intelligence-graph"), { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(file, null, 2));
  return file;
}
