import { execSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tmpDir = join(root, ".tmp");
const bundlePath = join(tmpDir, "test-grocery-bundle.mjs");
const runnerPath = join(tmpDir, "test-grocery-runner.mjs");

mkdirSync(tmpDir, { recursive: true });

execSync(
  `npx esbuild scripts/test-grocery-retrieval.ts --bundle --platform=node --format=esm --outfile=${bundlePath} --packages=external`,
  { cwd: root, stdio: "inherit" },
);

writeFileSync(runnerPath, `import "./test-grocery-bundle.mjs";\n`, "utf8");

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
