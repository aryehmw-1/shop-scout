#!/usr/bin/env node
/**
 * Remove build caches before a clean npm install / dev start.
 *   npm run clean
 *   npm install
 *   npm run dev
 */
import { rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  join(root, ".next"),
  join(root, "node_modules", ".cache"),
];

for (const p of targets) {
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log("[clean-dev] removed", p);
  }
}

const reinstall = process.argv.includes("--reinstall");
if (reinstall) {
  const lock = join(root, "package-lock.json");
  if (existsSync(lock)) {
    console.log("[clean-dev] npm ci …");
    execSync("npm ci", { cwd: root, stdio: "inherit" });
  } else {
    console.log("[clean-dev] npm install …");
    execSync("npm install", { cwd: root, stdio: "inherit" });
  }
  const nextPkg = join(root, "node_modules", "next", "package.json");
  if (!existsSync(nextPkg)) {
    console.error("[clean-dev] ERROR: next still missing after install");
    process.exit(1);
  }
  console.log("[clean-dev] next OK:", nextPkg);
}

console.log("[clean-dev] done");
