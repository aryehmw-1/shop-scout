import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RetailerId } from "@/lib/types";

export interface DecisionSnapshot {
  at: string;
  canonicalId: string;
  winnerOfferId: string;
  winnerRetailer: RetailerId;
  winnerPrice: number;
  compositeScore: number;
  identityConfidence: number;
  validatedOfferCount: number;
  priceSpreadRatio: number;
}

export interface SnapshotHistoryFile {
  version: 1;
  snapshots: DecisionSnapshot[];
}

const DIR = join(process.cwd(), "data", "intelligence-graph", "decision-snapshots");
const MAX_PER_CANONICAL = 30;

function pathFor(canonicalId: string): string {
  const safe = canonicalId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return join(DIR, `${safe}.json`);
}

export function loadSnapshots(canonicalId: string): DecisionSnapshot[] {
  const p = pathFor(canonicalId);
  if (!existsSync(p)) return [];
  try {
    const file = JSON.parse(readFileSync(p, "utf8")) as SnapshotHistoryFile;
    return file.snapshots ?? [];
  } catch {
    return [];
  }
}

/** Trim snapshot files to MAX_PER_CANONICAL (idempotent housekeeping). */
export function compactAllSnapshotHistories(): { files: number; trimmed: number } {
  mkdirSync(DIR, { recursive: true });
  let files = 0;
  let trimmed = 0;
  for (const name of readdirSync(DIR)) {
    if (!name.endsWith(".json")) continue;
    files++;
    const p = join(DIR, name);
    try {
      const file = JSON.parse(readFileSync(p, "utf8")) as SnapshotHistoryFile;
      const before = file.snapshots?.length ?? 0;
      if (before > MAX_PER_CANONICAL) {
        file.snapshots = file.snapshots.slice(0, MAX_PER_CANONICAL);
        writeFileSync(p, JSON.stringify(file, null, 2));
        trimmed += before - MAX_PER_CANONICAL;
      }
    } catch {
      /* skip corrupt */
    }
  }
  return { files, trimmed };
}

export function appendSnapshot(snapshot: DecisionSnapshot): void {
  mkdirSync(DIR, { recursive: true });
  const existing = loadSnapshots(snapshot.canonicalId);
  const next = [snapshot, ...existing].slice(0, MAX_PER_CANONICAL);
  writeFileSync(
    pathFor(snapshot.canonicalId),
    JSON.stringify({ version: 1, snapshots: next }, null, 2),
  );
}

export function historicalStabilityScore(canonicalId: string): number {
  const snaps = loadSnapshots(canonicalId);
  if (snaps.length < 2) return 0.75;

  const winners = snaps.slice(0, 7).map((s) => s.winnerOfferId);
  const unique = new Set(winners).size;
  if (unique === 1) return 1;
  if (unique === 2 && winners.length >= 3) return 0.65;
  return Math.max(0.35, 1 - (unique - 1) * 0.2);
}

export function analyzeRecommendationVolatility(canonicalId: string): {
  volatile: boolean;
  volatilityScore: number;
  priorWinner?: string;
  winnerChangesLast7: number;
  note?: string;
} {
  const snaps = loadSnapshots(canonicalId);
  if (snaps.length < 2) {
    return {
      volatile: false,
      volatilityScore: 0,
      winnerChangesLast7: 0,
      note: "Insufficient history for stability analysis.",
    };
  }

  const recent = snaps.slice(0, 7);
  let changes = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.winnerOfferId !== recent[i - 1]!.winnerOfferId) changes++;
  }

  const volatilityScore = recent.length > 1 ? changes / (recent.length - 1) : 0;
  const volatile = volatilityScore >= 0.5 || changes >= 2;

  const scoreDrift =
    recent.length >= 2 ?
      Math.abs(recent[0]!.compositeScore - recent[1]!.compositeScore)
    : 0;

  let note: string | undefined;
  if (volatile) {
    note = `Recommendation shifted ${changes} time(s) recently — compare stores before buying.`;
  } else if (scoreDrift > 0.12) {
    note = "Scoring inputs changed since last evaluation; winner may differ on recheck.";
  }

  return {
    volatile,
    volatilityScore: Math.round(volatilityScore * 1000) / 1000,
    priorWinner: recent[1]?.winnerRetailer,
    winnerChangesLast7: changes,
    note,
  };
}

export function loadAllSnapshots(): DecisionSnapshot[] {
  if (!existsSync(DIR)) return [];
  const out: DecisionSnapshot[] = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const file = JSON.parse(readFileSync(join(DIR, f), "utf8")) as SnapshotHistoryFile;
      if (file.snapshots[0]) out.push(file.snapshots[0]!);
    } catch {
      /* skip */
    }
  }
  return out;
}
