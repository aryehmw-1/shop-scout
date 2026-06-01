/**
 * Intent transition regression tests — refine vs replace boundary management.
 * Usage: npm run test:intent
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tmpDir = join(root, ".tmp");
const bundlePath = join(tmpDir, "test-intent-bundle.mjs");
const runnerPath = join(tmpDir, "test-intent-runner.mjs");

mkdirSync(tmpDir, { recursive: true });

execSync(
  `npx esbuild scripts/test-intent-transition.ts --bundle --platform=node --format=esm --outfile=${bundlePath} --packages=external`,
  { cwd: root, stdio: "inherit" },
);

writeFileSync(
  runnerPath,
  `import "./test-intent-bundle.mjs";\n`,
  "utf8",
);

try {
  execSync(`node ${runnerPath}`, { cwd: tmpDir, stdio: "inherit" });
} catch (e) {
  process.exit(e.status ?? 1);
} finally {
  try {
    unlinkSync(runnerPath);
  } catch {
    /* ignore */
  }
}
