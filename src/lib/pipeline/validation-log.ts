import "server-only";

// Append-only audit trail for every validation decision / status transition.

import { prisma } from "../db/prisma";
import type { AiMatchResult, ProcessingStatus } from "./types";

export interface LogValidationInput {
  productId?: string;
  rawProductRecordId?: string;
  oldStatus?: ProcessingStatus | null;
  newStatus: ProcessingStatus;
  score?: number;
  reasons: string[];
  aiUsed?: boolean;
  aiResult?: AiMatchResult;
  adminOverride?: boolean;
  adminUserId?: string;
}

export async function logValidation(input: LogValidationInput): Promise<void> {
  await prisma.validationLog.create({
    data: {
      productId: input.productId,
      rawProductRecordId: input.rawProductRecordId,
      oldStatus: input.oldStatus ?? null,
      newStatus: input.newStatus,
      score: input.score,
      reasonsJson: JSON.stringify(input.reasons ?? []),
      aiUsed: !!input.aiUsed,
      aiResultJson: input.aiResult ? JSON.stringify(input.aiResult) : null,
      adminOverride: !!input.adminOverride,
      adminUserId: input.adminUserId,
    },
  });
}
