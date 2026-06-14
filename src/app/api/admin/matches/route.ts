import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/matches?status=pending&decision=EXACT_MATCH&limit=100
export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const decision = url.searchParams.get("decision") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 300);

  const where: Record<string, unknown> = {};
  if (status) where.adminStatus = status;
  if (decision) where.decision = decision;

  const [rows, stats] = await Promise.all([
    prisma.productMatchDecision.findMany({
      where,
      orderBy: [{ adminStatus: "asc" }, { confidence: "asc" }],
      take: limit,
    }),
    prisma.productMatchDecision.groupBy({ by: ["adminStatus"], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    rows,
    stats: Object.fromEntries(stats.map((s) => [s.adminStatus, s._count._all])),
  });
}

// POST { id, action: "approve" | "reject", override?, note? }
// approve  → keep the machine decision as correct (adminOverride = decision)
// reject   → mark wrong; override carries the corrected decision (the feedback)
export async function POST(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    action?: "approve" | "reject";
    override?: string;
    note?: string;
  };
  if (!body.id || !body.action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const row = await prisma.productMatchDecision.findUnique({ where: { id: body.id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const adminOverride =
    body.action === "approve" ? row.decision : (body.override ?? "DIFFERENT");

  await prisma.productMatchDecision.update({
    where: { id: body.id },
    data: {
      adminStatus: body.action === "approve" ? "approved" : "rejected",
      adminOverride,
      adminNote: body.note ?? null,
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
