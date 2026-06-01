/**
 * Persistent experiment batch storage under artifacts/experiments/.
 */
import { mkdir, writeFile, readFile, appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ExperimentBatchResult, ExperimentCellResult } from "./types";

export const EXPERIMENT_ROOT = join(process.cwd(), "artifacts", "experiments");
const INDEX_FILE = join(EXPERIMENT_ROOT, "index.jsonl");

export interface ExperimentIndexEntry {
  batchId: string;
  retailerId: string;
  presetId?: string;
  startedAt: string;
  completedAt: string;
  cellCount: number;
  challengeFrequency: number;
  artifactRoot: string;
}

export async function saveExperimentBatch(result: ExperimentBatchResult): Promise<string> {
  const dir = join(EXPERIMENT_ROOT, result.batchId);
  await mkdir(dir, { recursive: true });

  await writeFile(join(dir, "batch.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  for (const cell of result.cells) {
    const cellDir = join(dir, "cells", cell.cell.id);
    await mkdir(cellDir, { recursive: true });
    await writeFile(join(cellDir, "result.json"), `${JSON.stringify(cell, null, 2)}\n`, "utf8");
    if (cell.fingerprint) {
      await writeFile(
        join(cellDir, "fingerprint.json"),
        `${JSON.stringify(cell.fingerprint, null, 2)}\n`,
        "utf8",
      );
    }
  }

  const entry: ExperimentIndexEntry = {
    batchId: result.batchId,
    retailerId: result.retailerId,
    presetId: result.presetId,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    cellCount: result.cells.length,
    challengeFrequency: result.comparison.challengeFrequency,
    artifactRoot: dir,
  };
  await appendFile(INDEX_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  return dir;
}

export async function listExperimentBatches(limit = 50): Promise<ExperimentIndexEntry[]> {
  if (!existsSync(INDEX_FILE)) return [];
  const raw = await readFile(INDEX_FILE, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => JSON.parse(l) as ExperimentIndexEntry)
    .reverse();
}

export async function loadExperimentBatch(batchId: string): Promise<ExperimentBatchResult | null> {
  const path = join(EXPERIMENT_ROOT, batchId, "batch.json");
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as ExperimentBatchResult;
}

export async function loadExperimentCell(
  batchId: string,
  cellId: string,
): Promise<ExperimentCellResult | null> {
  const path = join(EXPERIMENT_ROOT, batchId, "cells", cellId, "result.json");
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ExperimentCellResult;
}

/** Resolve paths for artifact viewer (screenshot, html, har from extraction vault). */
export async function experimentCellAssets(batchId: string, cellId: string) {
  const cell = await loadExperimentCell(batchId, cellId);
  if (!cell) return null;
  const extractionDir = cell.fetch.artifactDir;
  return {
    cell,
    extractionDir,
    screenshot: extractionDir ? join(extractionDir, "challenge.png") : null,
    html: extractionDir ? join(extractionDir, "page.html") : null,
    har: extractionDir ? join(extractionDir, "network.har") : null,
    meta: extractionDir ? join(extractionDir, "meta.json") : null,
    experimentResult: join(EXPERIMENT_ROOT, batchId, "cells", cellId, "result.json"),
  };
}

export async function listBatchCellIds(batchId: string): Promise<string[]> {
  const cellsDir = join(EXPERIMENT_ROOT, batchId, "cells");
  if (!existsSync(cellsDir)) return [];
  return readdir(cellsDir);
}
