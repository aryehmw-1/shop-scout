/**
 * Clarification specificity regression — obvious product searches skip clarify loops.
 * Usage: npm run test:clarify
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tmpDir = join(root, ".tmp");
const bundlePath = join(tmpDir, "test-clarify-bundle.mjs");
const runnerPath = join(tmpDir, "test-clarify-runner.mjs");

mkdirSync(tmpDir, { recursive: true });

execSync(
  `npx esbuild scripts/test-clarify-specificity.ts --bundle --platform=node --format=esm --outfile=${bundlePath} --packages=external`,
  { cwd: root, stdio: "inherit" },
);

writeFileSync(runnerPath, `import "./test-clarify-bundle.mjs";\n`, "utf8");

try {
  execSync(`node ${runnerPath}`, { cwd: tmpDir, stdio: "inherit" });
} catch (e) {
  process.exit(e?.status ?? 1);
} finally {
  try {
    unlinkSync(runnerPath);
  } catch {
    /* ignore */
  }
}
