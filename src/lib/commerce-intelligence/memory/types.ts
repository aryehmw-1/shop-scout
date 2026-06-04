/** Structured memory layers — factual vs behavioral vs trust vs eval vs history. */

export type MemoryLayer =
  | "factual"
  | "behavioral"
  | "trust"
  | "evaluation"
  | "recommendation_history";

export interface MemoryEntry {
  key: string;
  layer: MemoryLayer;
  value: unknown;
  weight: number;
  createdAt: string;
  expiresAt?: string;
  source: string;
}

export interface MemoryStoreFile {
  version: 1;
  updatedAt: string;
  entries: MemoryEntry[];
}

/** Default TTL days per layer */
export const MEMORY_TTL_DAYS: Record<MemoryLayer, number | null> = {
  factual: 90,
  behavioral: 30,
  trust: 60,
  evaluation: 180,
  recommendation_history: 365,
};
