#!/usr/bin/env node
/**
 * Fail fast on missing modules / unresolved imports before `next build`.
 * Used by CI, prebuild, and deploy-verify CLI.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const CRITICAL = [
  "src/lib/demo-commerce/canonical/to-search-results.ts",
  "src/lib/commerce-intelligence/ops/deploy-verify.ts",
  "src/lib/commerce-intelligence/retrieval/graph-to-search-results.ts",
];

let failed = false;

for (const rel of CRITICAL) {
  if (!existsSync(join(ROOT, rel))) {
    console.error(`[verify-build] missing critical module: ${rel}`);
    failed = true;
  }
}

const tc = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (tc.status !== 0) {
  failed = true;
  console.error("[verify-build] TypeScript check failed:\n");
  console.error(tc.stderr || tc.stdout || "unknown error");
}

if (failed) process.exit(1);
console.log("[verify-build] critical modules present · typecheck ok");
