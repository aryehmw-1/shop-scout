"use client";

import { initBetaCohort } from "../beta/cohort-client";
import { trackIntelligenceEvent } from "./track-client";

const KEY = "ss-intel-session";
const LAST_VISIT_KEY = "ss-intel-last-visit";
/** Gap before we count a new browser session as a return visit. */
const RETURN_GAP_MS = 60 * 60 * 1000;

export function getIntelligenceSessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

/** Call once per tab session — records return visits for retention learning. */
export function recordIntelligenceSessionStart(): void {
  if (typeof window === "undefined") return;
  initBetaCohort();
  const now = Date.now();
  const lastRaw = localStorage.getItem(LAST_VISIT_KEY);
  if (lastRaw) {
    const elapsed = now - Number(lastRaw);
    if (elapsed > RETURN_GAP_MS) {
      trackIntelligenceEvent("session_return");
    }
  }
  localStorage.setItem(LAST_VISIT_KEY, String(now));
}
