/** Anonymized session replay — no account IDs, no full URLs with PII. */

export interface SessionReplayRecord {
  id: string;
  sessionId: string;
  /** Beta rollout cohort for operator analysis */
  cohort?: string;
  at: string;
  queryCategory: string;
  /** Internal beta only — truncated, optional */
  queryPreview?: string;
  matched: boolean;
  canonicalId?: string;
  winnerRetailer?: string;
  winnerPrice?: number;
  trustSummary: string;
  identityScore: number;
  evidenceCount: number;
  uncertaintyCount: number;
  interactionTrail: string[];
  feedback?: {
    useful?: boolean;
    bought?: boolean;
    explanationHelpful?: boolean;
    whyNot?: string;
  };
}

export interface SessionReplayFile {
  version: 1;
  updatedAt: string;
  sessions: SessionReplayRecord[];
}
