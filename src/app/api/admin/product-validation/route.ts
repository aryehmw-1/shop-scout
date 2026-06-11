import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { validationStats, runRawValidationBatch } from "@/lib/pipeline/batch";
import { logValidation } from "@/lib/pipeline/validation-log";
import { canTransition } from "@/lib/pipeline/state-machine";
import { PROCESSING_STATUSES, type ProcessingStatus } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

// GET /api/admin/product-validation?status=NEEDS_REVIEW&limit=50
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "NEEDS_REVIEW";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const [stats, records] = await Promise.all([
    validationStats(),
    prisma.rawProductRecord.findMany({
      where: PROCESSING_STATUSES.includes(status as ProcessingStatus)
        ? { processingStatus: status }
        : {},
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        retailer: true,
        title: true,
        brand: true,
        imageUrl: true,
        price: true,
        size: true,
        upcGtin: true,
        processingStatus: true,
        validationStatus: true,
        confidenceScore: true,
        validationReasonsJson: true,
        duplicateGroupId: true,
        matchedProductId: true,
        scrapedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ stats, records });
}

type Action = "approve" | "reject" | "mark_verified" | "send_back" | "edit";

// POST { id, action, fields? }
export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    action?: Action;
    fields?: Record<string, unknown>;
    adminUserId?: string;
  };
  if (body.action === "run_batch" as Action) {
    const summary = await runRawValidationBatch({ limit: 200, useAi: true });
    return NextResponse.json({ ok: true, summary });
  }
  if (!body.id || !body.action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const record = await prisma.rawProductRecord.findUnique({ where: { id: body.id } });
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });

  const target: Record<Action, { status: ProcessingStatus; validation: string }> = {
    approve: { status: "PUBLISHED", validation: "approved" },
    mark_verified: { status: "VERIFIED", validation: "approved" },
    reject: { status: "REJECTED", validation: "rejected" },
    send_back: { status: "CHECKED", validation: "needs_review" },
    edit: { status: record.processingStatus as ProcessingStatus, validation: record.validationStatus ?? "needs_review" },
  };
  const next = target[body.action];
  const from = record.processingStatus as ProcessingStatus;

  if (body.action !== "edit" && !canTransition(from, next.status)) {
    return NextResponse.json(
      { error: `illegal transition ${from} → ${next.status}` },
      { status: 409 },
    );
  }

  await prisma.rawProductRecord.update({
    where: { id: body.id },
    data: {
      processingStatus: next.status,
      validationStatus: next.validation,
      ...(body.action === "edit" && body.fields ? sanitizeFields(body.fields) : {}),
    },
  });

  await logValidation({
    rawProductRecordId: body.id,
    productId: record.matchedProductId ?? undefined,
    oldStatus: from,
    newStatus: next.status,
    score: record.confidenceScore ?? undefined,
    reasons: [`admin_${body.action}`],
    adminOverride: true,
    adminUserId: body.adminUserId,
  });

  return NextResponse.json({ ok: true });
}

// Only allow editing a safe subset of fields from the admin UI.
function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const allowed = ["title", "brand", "imageUrl", "price", "size", "color", "variant", "upcGtin", "modelNumber"];
  const out: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in fields) out[k] = fields[k];
  }
  return out;
}
