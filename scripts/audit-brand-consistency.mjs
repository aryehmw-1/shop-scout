/**
 * Brand consistency audit — navbar mark must match tab icons pixel-for-pixel at 32px.
 * Fails build if geometry, hashes, or import paths diverge.
 * Usage: npm run audit:brand
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const markSvg = join(root, "public/brand/mark.svg");
const brandDir = join(root, "public/brand");
const tmpDir = join(root, ".tmp/brand-audit");
const HOUSE_FP = "M4 11.5 12 5l8 6.5V20";

function md5(buf) {
  return createHash("md5").update(buf).digest("hex");
}

function md5File(path) {
  return md5(readFileSync(path));
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

const checks = [];

checks.push(check("Canonical mark.svg exists", existsSync(markSvg)));

const svg = readFileSync(markSvg, "utf8");
const svgMd5 = md5(svg.trim());
checks.push(check("mark.svg uses canonical house geometry", svg.includes(HOUSE_FP)));
checks.push(check("mark.svg uses filled house (not stroke outline)", !/\bstroke="#ffffff"/.test(svg)));
checks.push(check("mark.svg has gradient tile", /ss-mark-grad|f97316/.test(svg)));

const manifestPath = join(brandDir, "mark.manifest.json");
checks.push(check("mark.manifest.json exists (run brand:generate)", existsSync(manifestPath)));
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  checks.push(check("manifest svgMd5 matches mark.svg", manifest.svgMd5 === svgMd5));
  for (const [name, meta] of Object.entries(manifest.assets ?? {})) {
    const assetPath = join(brandDir, name);
    if (existsSync(assetPath)) {
      checks.push(check(`manifest hash: ${name}`, md5File(assetPath) === meta.md5));
    } else {
      checks.push(check(`manifest asset exists: ${name}`, false));
    }
  }
}

const forbidden = [
  join(root, "src/app/icon.svg"),
  join(root, "src/app/apple-icon.svg"),
  join(root, "src/app/icon.tsx"),
  join(root, "src/app/apple-icon.tsx"),
  join(root, "public/brand/icon.svg"),
  join(root, "public/favicon.ico"),
  join(root, "public/icon.png"),
];
for (const path of forbidden) {
  checks.push(check(`No parallel asset: ${path.replace(root, "")}`, !existsSync(path)));
}

const brandSvgs = walkFiles(brandDir).filter((p) => p.endsWith(".svg") && p !== markSvg);
for (const extra of brandSvgs) {
  checks.push(check(`No duplicate brand SVG: ${extra.replace(root, "")}`, false));
}

const brandHomeMark = readFileSync(join(root, "src/components/brand/BrandHomeMark.tsx"), "utf8");
checks.push(
  check("BrandHomeMark imports mark-config", brandHomeMark.includes("@/lib/brand/mark-config")),
);
checks.push(
  check("BrandHomeMark uses BRAND_NAV_ICON_URL (mark-32.png)", brandHomeMark.includes("BRAND_NAV_ICON_URL")),
);
checks.push(
  check("BrandHomeMark renders img raster (favicon parity)", brandHomeMark.includes("<img")),
);
checks.push(
  check("BrandHomeMark has no CSS rounded-xl/shadow", !brandHomeMark.includes("rounded-xl") && !brandHomeMark.includes("shadow-lg")),
);
checks.push(
  check("BrandHomeMark does not use Lucide Home", !brandHomeMark.includes("lucide-react")),
);

const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
checks.push(check("layout.tsx imports brand mark-config", layout.includes("@/lib/brand/mark-config")));

const manifestTs = readFileSync(join(root, "src/app/manifest.ts"), "utf8");
checks.push(check("manifest.ts imports brand mark-config", manifestTs.includes("@/lib/brand/mark-config")));

const generated = readFileSync(join(root, "src/lib/brand/mark.generated.ts"), "utf8");
checks.push(check("mark.generated.ts contains house fingerprint", generated.includes(HOUSE_FP)));
checks.push(check("mark.generated.ts svgMd5 matches mark.svg", generated.includes(svgMd5)));

const duplicateHouseFiles = [];
for (const file of walkFiles(join(root, "src")).concat(walkFiles(join(root, "public")))) {
  if (file === markSvg) continue;
  if (file.endsWith("mark.generated.ts")) continue;
  if (file.endsWith("mark.manifest.json")) continue;
  if (file.endsWith("mark-config.ts")) continue;
  if (file.endsWith("audit-brand-consistency.mjs")) continue;
  if (file.endsWith(".png") || file.endsWith(".ico") || file.endsWith(".jpg")) continue;
  try {
    const content = readFileSync(file, "utf8");
    if (content.includes(HOUSE_FP) && (file.endsWith(".tsx") || file.endsWith(".ts") || file.endsWith(".svg"))) {
      duplicateHouseFiles.push(file.replace(root, ""));
    }
  } catch {
    /* binary */
  }
}
checks.push(
  check(
    "No duplicate house SVG paths in codebase",
    duplicateHouseFiles.length === 0,
    duplicateHouseFiles.join(", ") || undefined,
  ),
);

execSync(`mkdir -p ${tmpDir}`, { cwd: root });
execSync(
  `npx --yes @resvg/resvg-js-cli --fit-width 32 --fit-height 32 ${markSvg} ${join(tmpDir, "fresh-32.png")}`,
  { cwd: root, stdio: "pipe" },
);

const fresh32 = readFileSync(join(tmpDir, "fresh-32.png"));
const mark32 = readFileSync(join(brandDir, "mark-32.png"));
checks.push(check("mark-32.png matches live SVG render", md5(fresh32) === md5(mark32)));

for (const name of ["mark-16.png", "mark-180.png", "mark-512.png", "og-mark.png", "mark.ico"]) {
  checks.push(check(`Generated ${name} exists`, existsSync(join(brandDir, name))));
}

try {
  execSync(
    `python3 - <<'PY'
from PIL import Image
im = Image.open("${join(brandDir, "mark-16.png")}").convert("RGBA")
w, h = im.size
assert w == h == 16
pixels = list(im.getdata())
non_bg = sum(1 for r,g,b,a in pixels if a > 32 and (r,g,b) != (250,246,240))
assert non_bg > 40, f"16px mark too empty ({non_bg} px)"
print(f"16px readability: {non_bg} visible pixels")
PY`,
    { cwd: root, stdio: "inherit" },
  );
  checks.push(check("16px favicon has sufficient visible pixels", true));
} catch {
  checks.push(check("16px favicon has sufficient visible pixels", false));
}

const failed = checks.filter((c) => !c);
console.log(`\n=== Brand consistency: ${checks.length - failed.length}/${checks.length} passed ===`);

if (failed.length) {
  console.error("\nFix: npm run brand:generate && npm run audit:brand");
  process.exit(1);
}

console.log("\nSingle canonical mark: public/brand/mark.svg");
console.log("Navbar (inline SVG) + tab icons (PNG/ICO) are hash-locked and cannot diverge.");
