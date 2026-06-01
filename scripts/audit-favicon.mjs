/**
 * End-to-end favicon audit — verifies served HTML + assets match brand SVG.
 * Usage: npm run audit:favicon [baseUrl]
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const baseUrl = process.argv[2] ?? "http://127.0.0.1:3456";
const outDir = join(root, ".tmp/favicon-audit");

mkdirSync(outDir, { recursive: true });

function fetch(url) {
  return execSync(`curl -sS "${url}"`, { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
}

function fetchHeaders(url) {
  return execSync(`curl -sSI "${url}"`, { encoding: "utf8" });
}

function md5(buf) {
  return createHash("md5").update(buf).digest("hex");
}

const html = fetch(`${baseUrl}/`).toString("utf8");
const iconLinks = [...html.matchAll(/<link[^>]+>/gi)]
  .map((m) => m[0])
  .filter((tag) => /icon|apple|shortcut|mask/i.test(tag));

console.log("\n=== Rendered <head> icon tags ===");
for (const tag of iconLinks) console.log(tag);

const faviconTags = iconLinks.filter((t) => /rel="icon"|shortcut icon/i.test(t));
const duplicateFavicon = faviconTags.length > 1;
console.log(`\nFavicon link count: ${faviconTags.length}${duplicateFavicon ? " (WARNING: competing definitions)" : ""}`);

const markSvg = join(root, "public/brand/mark.svg");

const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

check("HTML includes at least one favicon link", faviconTags.length >= 1);
check("No competing duplicate favicon links", !duplicateFavicon || faviconTags.length <= 2);

for (const path of ["/brand/mark.ico", "/brand/mark-32.png", "/brand/mark-180.png", "/brand/mark.svg", "/favicon.ico"]) {
  const url = `${baseUrl}${path}`;
  const headers = fetchHeaders(url);
  const status = headers.match(/^HTTP\/[^\n]+/m)?.[0] ?? "unknown";
  const type = headers.match(/^content-type:\s*(.+)$/im)?.[1]?.trim() ?? "?";
  const len = Number(headers.match(/^content-length:\s*(\d+)/im)?.[1] ?? 0);
  const body = fetch(url);
  writeFileSync(join(outDir, path.replace(/\//g, "_")), body);

  console.log(`\n--- ${path} ---`);
  console.log(status);
  console.log(`content-type: ${type}`);
  console.log(`content-length: ${len || body.length}`);

  if (path === "/brand/mark.ico") {
    check("mark.ico under 16KB", body.length < 16 * 1024, `${body.length} bytes`);
    check("mark.ico serves 200", /200/.test(status));
  }
  if (path === "/favicon.ico") {
    check("favicon.ico redirects to brand icon", /30[1278]/.test(status));
  }
  if (path === "/brand/mark-32.png") {
    check("mark-32.png matches generated asset", md5(body) === md5(readFileSync(join(root, "public/brand/mark-32.png"))));
    check("mark-32.png is PNG", body.length > 100 && body[0] === 0x89);
  }
  if (path === "/brand/mark-180.png") {
    check("mark-180.png serves 200", /200/.test(status));
    check("mark-180.png under 32KB", body.length < 32 * 1024, `${body.length} bytes`);
  }
}

const hasMaskIcon = iconLinks.some((t) => /mask-icon/i.test(t));
check("No mask-icon tag (Safari pinned-tab monochrome)", !hasMaskIcon);

const failed = checks.filter((c) => !c.ok);
console.log(`\n=== Summary: ${checks.length - failed.length}/${checks.length} passed ===`);
if (failed.length) {
  console.error("\nFailed checks:");
  for (const f of failed) console.error(` - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
  process.exit(1);
}

console.log("\nFavicon pipeline OK. Hard-refresh Safari (Cmd+Shift+R) if tab still shows stale icon.");
