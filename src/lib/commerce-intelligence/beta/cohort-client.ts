"use client";

import { defaultBetaCohortFromEnv, normalizeBetaCohort, type BetaCohort } from "./cohort";

const STORAGE_KEY = "ss-beta-cohort";

/** Resolve cohort: URL ?cohort= → sessionStorage → build default. */
export function getBetaCohort(): BetaCohort {
  if (typeof window === "undefined") return "general";

  const fromUrl = new URLSearchParams(window.location.search).get("cohort");
  if (fromUrl) {
    const c = normalizeBetaCohort(fromUrl);
    sessionStorage.setItem(STORAGE_KEY, c);
    return c;
  }

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) return normalizeBetaCohort(stored);

  const envDefault = process.env.NEXT_PUBLIC_BETA_COHORT;
  return normalizeBetaCohort(envDefault ?? "general");
}

/** Call once per app load (e.g. with session start). */
export function initBetaCohort(): BetaCohort {
  const c = getBetaCohort();
  sessionStorage.setItem(STORAGE_KEY, c);
  return c;
}
