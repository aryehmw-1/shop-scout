import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ARTIFACT_ROOT = join(ROOT, "artifacts", "brand-audit");

function safeJson(path: string) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const EST_BYTES = {
  image: 120_000,
  font: 45_000,
  media: 400_000,
  analytics: 25_000,
  tracker: 15_000,
  other: 18_000,
} as const;

export async function GET() {
  const visual = safeJson(join(ARTIFACT_ROOT, "latest-visual-audit.json"));
  const browser = safeJson(join(ARTIFACT_ROOT, "latest-browser-audit.json"));

  const classes = new Map<string, { blocked: number; allowed: number }>();
  const merge = (items: Array<{ className: string; blocked: number; allowed: number }> | undefined) => {
    if (!items) return;
    for (const i of items) {
      const row = classes.get(i.className) ?? { blocked: 0, allowed: 0 };
      row.blocked += i.blocked ?? 0;
      row.allowed += i.allowed ?? 0;
      classes.set(i.className, row);
    }
  };

  merge(visual?.requestComposition);
  for (const b of browser?.browsers ?? []) merge(b.requestComposition);

  const rows = [...classes.entries()].map(([className, c]) => {
    const est = (EST_BYTES as any)[className] ?? EST_BYTES.other;
    return {
      className,
      blocked: c.blocked,
      allowed: c.allowed,
      estimatedSavedKb: Math.round(((c.blocked * est) / 1024) * 100) / 100,
    };
  });
  const totals = rows.reduce(
    (acc, r) => {
      acc.blocked += r.blocked;
      acc.allowed += r.allowed;
      acc.estimatedSavedKb += r.estimatedSavedKb;
      return acc;
    },
    { blocked: 0, allowed: 0, estimatedSavedKb: 0 },
  );

  return NextResponse.json({
    classes: rows,
    totals: {
      ...totals,
      blockedPct:
        totals.blocked + totals.allowed > 0 ?
          Math.round((totals.blocked / (totals.blocked + totals.allowed)) * 1000) / 10
        : 0,
      estimatedSavedMb: Math.round((totals.estimatedSavedKb / 1024) * 1000) / 1000,
    },
    sourceRuns: {
      visualRunId: visual?.runId,
      browserRunId: browser?.runId,
    },
  });
}
