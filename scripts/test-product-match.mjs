/**
 * Product match relevance tests runner.
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tmpDir = join(root, ".tmp");
const bundlePath = join(tmpDir, "test-product-match-bundle.mjs");

mkdirSync(tmpDir, { recursive: true });

execSync(
  `npx esbuild scripts/test-product-match.ts --bundle --platform=node --format=esm --outfile=${bundlePath} --packages=external`,
  { cwd: root, stdio: "inherit" },
);

execSync(`node ${bundlePath}`, { stdio: "inherit" });
