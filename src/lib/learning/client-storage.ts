"use client";

import type { LearningProfile } from "../types";
import { LEARNING_STORAGE_KEY } from "./constants";
import {
  emptyLearningProfile,
  mergeLearningProfiles,
  recordProductInteraction,
  recordSearch,
} from "./preference-learner";
import type { ProductOffer, ShoppingIntent } from "../types";

export function loadLearningProfile(): LearningProfile {
  if (typeof window === "undefined") return emptyLearningProfile();
  try {
    const raw = localStorage.getItem(LEARNING_STORAGE_KEY);
    if (!raw) return emptyLearningProfile();
    const parsed = JSON.parse(raw) as LearningProfile;
    if (parsed.version !== 1) return emptyLearningProfile();
    return parsed;
  } catch {
    return emptyLearningProfile();
  }
}

export function saveLearningProfile(profile: LearningProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(profile));
}

export function learnFromSearch(intent: ShoppingIntent): LearningProfile {
  const next = recordSearch(loadLearningProfile(), intent);
  saveLearningProfile(next);
  return next;
}

export function learnFromProduct(offer: ProductOffer): LearningProfile {
  const next = recordProductInteraction(loadLearningProfile(), offer);
  saveLearningProfile(next);
  return next;
}

export function syncLearningFromServer(serverProfile?: LearningProfile | null): LearningProfile {
  const local = loadLearningProfile();
  const merged = mergeLearningProfiles(local, serverProfile);
  saveLearningProfile(merged);
  return merged;
}
