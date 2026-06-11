// Status state machine. Translates a confidence score (and category) into the
// pipeline + validation status, and guards legal transitions.
//
//   95–100 → VERIFIED (approved)        → eligible to PUBLISH
//   90–94  → approved (MATCHED)
//   70–89  → needs_review (NEEDS_REVIEW)
//   60–69  → needs_review, or REJECTED for size/variant-sensitive categories
//   <60    → REJECTED

import type {
  ProcessingStatus,
  ProductCategoryKind,
  ValidationOutcome,
  ValidationStatus,
} from "./types";

export interface ClassifyInput {
  score: number;
  hardReject: boolean;
  categoryKind: ProductCategoryKind;
  /** Did a structured (non-AI) tier confirm the match? */
  structurallyMatched: boolean;
  reasons: string[];
  aiUsed?: boolean;
}

export function classify(input: ClassifyInput): ValidationOutcome {
  const { score, hardReject, categoryKind, structurallyMatched, reasons, aiUsed } = input;

  if (hardReject) {
    return outcome("REJECTED", "rejected", score, reasons, aiUsed);
  }

  if (score >= 95 && structurallyMatched) {
    return outcome("VERIFIED", "approved", score, reasons, aiUsed);
  }
  if (score >= 90) {
    return outcome("MATCHED", "approved", score, reasons, aiUsed);
  }
  if (score >= 70) {
    return outcome("NEEDS_REVIEW", "needs_review", score, reasons, aiUsed);
  }
  if (score >= 60) {
    // Borderline: reject for categories where a wrong variant/size is dangerous.
    const strict = categoryKind === "grocery" || categoryKind === "household";
    return strict
      ? outcome("REJECTED", "rejected", score, [...reasons, "borderline_strict_category"], aiUsed)
      : outcome("NEEDS_REVIEW", "needs_review", score, reasons, aiUsed);
  }
  return outcome("REJECTED", "rejected", score, reasons, aiUsed);
}

function outcome(
  processingStatus: ProcessingStatus,
  validationStatus: ValidationStatus,
  confidenceScore: number,
  reasons: string[],
  aiUsed?: boolean,
): ValidationOutcome {
  return { processingStatus, validationStatus, confidenceScore, reasons, aiUsed: !!aiUsed };
}

// Legal forward transitions (plus side-states reachable from most points).
const ALLOWED: Record<ProcessingStatus, ProcessingStatus[]> = {
  RAW: ["CHECKED", "REJECTED", "NEEDS_REVIEW"],
  CHECKED: ["MATCHED", "NEEDS_REVIEW", "REJECTED"],
  MATCHED: ["VERIFIED", "NEEDS_REVIEW", "REJECTED"],
  VERIFIED: ["PUBLISHED", "NEEDS_REVIEW", "STALE", "REJECTED"],
  PUBLISHED: ["STALE", "NEEDS_REVIEW", "REJECTED"],
  STALE: ["CHECKED", "VERIFIED", "PUBLISHED", "NEEDS_REVIEW", "REJECTED"],
  NEEDS_REVIEW: ["VERIFIED", "PUBLISHED", "MATCHED", "REJECTED", "CHECKED"],
  REJECTED: ["NEEDS_REVIEW", "CHECKED"], // admin can send back for revalidation
};

export function canTransition(from: ProcessingStatus, to: ProcessingStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

/** Only VERIFIED/PUBLISHED with approved validation is user-visible. */
export function isPublishable(status: ProcessingStatus, validation: ValidationStatus): boolean {
  return (status === "VERIFIED" || status === "PUBLISHED") && validation === "approved";
}
