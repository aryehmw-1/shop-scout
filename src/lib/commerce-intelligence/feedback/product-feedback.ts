import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type WhyNotReason = "price" | "wrong_product" | "trust" | "other";

export interface ProductFeedbackEntry {
  at: string;
  sessionId?: string;
  cohort?: string;
  canonicalId?: string;
  useful?: boolean;
  bought?: boolean;
  explanationHelpful?: boolean;
  whyNot?: WhyNotReason;
}

export interface ProductFeedbackFile {
  version: 1;
  updatedAt: string;
  entries: ProductFeedbackEntry[];
}

const PATH = join(process.cwd(), "data", "intelligence-graph", "product-feedback.json");
const MAX = 3000;

function empty(): ProductFeedbackFile {
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

export function loadProductFeedback(): ProductFeedbackFile {
  if (!existsSync(PATH)) return empty();
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as ProductFeedbackFile;
  } catch {
    return empty();
  }
}

export function recordProductFeedback(entry: Omit<ProductFeedbackEntry, "at">): void {
  const store = loadProductFeedback();
  store.entries.unshift({ ...entry, at: new Date().toISOString() });
  store.entries = store.entries.slice(0, MAX);
  store.updatedAt = new Date().toISOString();
  mkdirSync(join(process.cwd(), "data", "intelligence-graph"), { recursive: true });
  writeFileSync(PATH, JSON.stringify(store, null, 2));
}

export function feedbackSummary(): {
  usefulYes: number;
  usefulNo: number;
  boughtYes: number;
  explanationHelpfulYes: number;
  whyNot: Record<string, number>;
} {
  const store = loadProductFeedback();
  let usefulYes = 0;
  let usefulNo = 0;
  let boughtYes = 0;
  let explanationHelpfulYes = 0;
  const whyNot: Record<string, number> = {};

  for (const e of store.entries) {
    if (e.useful === true) usefulYes++;
    if (e.useful === false) usefulNo++;
    if (e.bought === true) boughtYes++;
    if (e.explanationHelpful === true) explanationHelpfulYes++;
    if (e.whyNot) whyNot[e.whyNot] = (whyNot[e.whyNot] ?? 0) + 1;
  }

  return { usefulYes, usefulNo, boughtYes, explanationHelpfulYes, whyNot };
}
