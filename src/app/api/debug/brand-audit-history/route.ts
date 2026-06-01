import { NextResponse } from "next/server";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ARTIFACT_ROOT = join(ROOT, "artifacts", "brand-audit");
const HISTORY_ROOT = join(ARTIFACT_ROOT, "history");

function safeJson(path: string) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const latestVisual = safeJson(join(ARTIFACT_ROOT, "latest-visual-audit.json"));
  const latestBrowser = safeJson(join(ARTIFACT_ROOT, "latest-browser-audit.json"));

  let runs: Array<{
    runId: string;
    createdAt: string;
    visual?: any;
    browser?: any;
  }> = [];

  if (existsSync(HISTORY_ROOT)) {
    runs = readdirSync(HISTORY_ROOT)
      .map((id) => {
        const dir = join(HISTORY_ROOT, id);
        if (!statSync(dir).isDirectory()) return null;
        return {
          runId: id,
          createdAt: statSync(dir).mtime.toISOString(),
          visual: safeJson(join(dir, "report.json")),
          browser: safeJson(join(dir, "browser-report.json")),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.runId < b!.runId ? 1 : -1))
      .slice(0, 100) as any;
  }

  return NextResponse.json({
    latestVisual,
    latestBrowser,
    historyCount: runs.length,
    runs,
    artifactRoot: "artifacts/brand-audit/history",
  });
}
