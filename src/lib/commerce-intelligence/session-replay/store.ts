import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RecommendationExplanation } from "../explain/types";
import { defaultBetaCohortFromEnv, normalizeBetaCohort } from "../beta/cohort";
import { launchFlags } from "../ops/feature-flags";
import type { SessionReplayFile, SessionReplayRecord } from "./types";
import { intelligenceGraphDir } from "../storage-root";

const PATH = join(intelligenceGraphDir(), "session-replay.json");
const MAX_SESSIONS = 500;

function empty(): SessionReplayFile {
  return { version: 1, updatedAt: new Date().toISOString(), sessions: [] };
}

export function loadSessionReplay(): SessionReplayFile {
  if (!existsSync(PATH)) return empty();
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as SessionReplayFile;
  } catch {
    return empty();
  }
}

export function recordSessionReplay(opts: {
  sessionId: string;
  query: string;
  queryCategory: string;
  matched: boolean;
  explanation?: RecommendationExplanation;
  cohort?: string;
}): SessionReplayRecord | null {
  if (!launchFlags.betaMode && !launchFlags.analytics) return null;

  const id = `sr_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const ex = opts.explanation;

  const record: SessionReplayRecord = {
    id,
    sessionId: opts.sessionId.slice(0, 64),
    cohort: normalizeBetaCohort(opts.cohort ?? defaultBetaCohortFromEnv()),
    at: new Date().toISOString(),
    queryCategory: opts.queryCategory,
    queryPreview:
      launchFlags.sessionReplayQueries ?
        opts.query.trim().slice(0, 48) || undefined
      : undefined,
    matched: opts.matched,
    canonicalId: ex?.canonicalId,
    winnerRetailer: ex?.decision?.winnerRetailerName,
    winnerPrice: ex?.decision?.winnerPrice,
    trustSummary: ex?.trustSummary?.slice(0, 280) ?? "",
    identityScore: ex?.identity.overall ?? 0,
    evidenceCount: ex?.evidence.count ?? 0,
    uncertaintyCount: ex?.uncertainty.length ?? 0,
    interactionTrail: ["recommendation_shown"],
  };

  const store = loadSessionReplay();
  store.sessions.unshift(record);
  store.sessions = store.sessions.slice(0, MAX_SESSIONS);
  store.updatedAt = new Date().toISOString();
  mkdirSync(intelligenceGraphDir(), { recursive: true });
  writeFileSync(PATH, JSON.stringify(store, null, 2));

  return record;
}

export function patchSessionReplayCohort(sessionId: string, cohort: string): void {
  const store = loadSessionReplay();
  const hit = store.sessions.find((s) => s.sessionId === sessionId);
  if (!hit) return;
  hit.cohort = normalizeBetaCohort(cohort);
  store.updatedAt = new Date().toISOString();
  writeFileSync(PATH, JSON.stringify(store, null, 2));
}

export function appendSessionInteraction(sessionId: string, event: string): void {
  const store = loadSessionReplay();
  const hit = store.sessions.find((s) => s.sessionId === sessionId);
  if (!hit) return;
  if (!hit.interactionTrail.includes(event)) {
    hit.interactionTrail.push(event);
  }
  store.updatedAt = new Date().toISOString();
  writeFileSync(PATH, JSON.stringify(store, null, 2));
}

export function attachFeedbackToSession(
  sessionId: string,
  canonicalId: string | undefined,
  feedback: SessionReplayRecord["feedback"],
): void {
  const store = loadSessionReplay();
  const hit =
    canonicalId ?
      store.sessions.find((s) => s.canonicalId === canonicalId)
    : store.sessions.find((s) => s.sessionId === sessionId);
  if (!hit) return;
  hit.feedback = { ...hit.feedback, ...feedback };
  store.updatedAt = new Date().toISOString();
  writeFileSync(PATH, JSON.stringify(store, null, 2));
}

export function hashSessionId(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}
