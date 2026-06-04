import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

/** Modules that must exist on disk — catches deletions that leave dangling imports. */
export const CRITICAL_MODULE_PATHS = [
  "src/lib/demo-commerce/canonical/to-search-results.ts",
  "src/lib/commerce-intelligence/ops/deploy-verify.ts",
  "src/lib/commerce-intelligence/retrieval/graph-to-search-results.ts",
  "src/lib/ai/generate-reply.ts",
] as const;

export interface ModuleIntegrityReport {
  ok: boolean;
  missing: string[];
  typecheckOk: boolean;
  typecheckError?: string;
}

export function verifyCriticalModulesExist(): { ok: boolean; missing: string[] } {
  const root = process.cwd();
  const missing = CRITICAL_MODULE_PATHS.filter((rel) => !existsSync(join(root, rel)));
  return { ok: missing.length === 0, missing: [...missing] };
}

/** Runs `tsc --noEmit` — use in CI/deploy scripts before `next build`. */
export function runTypecheck(): { ok: boolean; error?: string } {
  try {
    execSync("npx tsc --noEmit -p tsconfig.json", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { ok: true };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const text = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    return { ok: false, error: text.slice(0, 4000) || "Typecheck failed" };
  }
}

export function verifyModuleIntegrity(opts?: { typecheck?: boolean }): ModuleIntegrityReport {
  const files = verifyCriticalModulesExist();
  const runTc = opts?.typecheck ?? process.env.VERIFY_TYPECHECK === "1";
  const tc = runTc ? runTypecheck() : { ok: true as const };

  return {
    ok: files.ok && tc.ok,
    missing: files.missing,
    typecheckOk: tc.ok,
    typecheckError: "error" in tc ? tc.error : undefined,
  };
}
