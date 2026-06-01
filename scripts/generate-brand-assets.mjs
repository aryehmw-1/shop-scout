/**
 * Generate all brand raster assets from public/brand/mark.svg (single source of truth).
 * Usage: npm run brand:generate
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const markSvg = join(root, "public/brand/mark.svg");
const tmpDir = join(root, ".tmp/brand");
const brandDir = join(root, "public/brand");

function md5(buf) {
  return createHash("md5").update(buf).digest("hex");
}

mkdirSync(tmpDir, { recursive: true });
mkdirSync(brandDir, { recursive: true });
mkdirSync(join(root, "src/lib/brand"), { recursive: true });

function renderPng(args, out) {
  execSync(`npx --yes @resvg/resvg-js-cli ${args} ${markSvg} ${out}`, {
    cwd: root,
    stdio: "inherit",
  });
}

renderPng("--fit-width 16 --fit-height 16", join(tmpDir, "mark-16.png"));
renderPng("--fit-width 32 --fit-height 32", join(tmpDir, "mark-32.png"));
renderPng("--fit-width 180 --fit-height 180", join(tmpDir, "mark-180.png"));
renderPng("--fit-width 512 --fit-height 512", join(tmpDir, "mark-512.png"));

const svg = readFileSync(markSvg, "utf8").trim();
const manifest = {
  canonical: "public/brand/mark.svg",
  generatedAt: new Date().toISOString(),
  svgMd5: md5(svg),
  housePathFingerprint: "M4 11.5 12 5l8 6.5V20",
  assets: {},
};

for (const [name, src] of [
  ["mark-16.png", "mark-16.png"],
  ["mark-32.png", "mark-32.png"],
  ["mark-180.png", "mark-180.png"],
  ["mark-512.png", "mark-512.png"],
]) {
  copyFileSync(join(tmpDir, src), join(brandDir, name));
  manifest.assets[name] = { md5: md5(readFileSync(join(brandDir, name))) };
  console.log(`Wrote ${join(brandDir, name)}`);
}
copyFileSync(join(tmpDir, "mark-512.png"), join(brandDir, "og-mark.png"));
manifest.assets["og-mark.png"] = { md5: md5(readFileSync(join(brandDir, "og-mark.png"))) };
console.log(`Wrote ${join(brandDir, "og-mark.png")}`);

execSync(
  `python3 - <<'PY'
from PIL import Image
import os

tmp = ${JSON.stringify(tmpDir)}
brand = ${JSON.stringify(brandDir)}

im32 = Image.open(os.path.join(tmp, "mark-32.png")).convert("RGBA")
im180 = Image.open(os.path.join(tmp, "mark-180.png")).convert("RGBA")

ico_path = os.path.join(brand, "mark.ico")
im32.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32)])
print(f"Wrote {ico_path} ({os.path.getsize(ico_path)} bytes)")

for legacy, src in [
    ("ss-tab-32.png", os.path.join(tmp, "mark-32.png")),
    ("ss-tab-180.png", os.path.join(tmp, "mark-180.png")),
]:
    dst = os.path.join(brand, legacy)
    with open(src, "rb") as fsrc, open(dst, "wb") as fdst:
        fdst.write(fsrc.read())
    print(f"Wrote legacy alias {dst}")

im32.save(os.path.join(brand, "ss-tab.ico"), format="ICO", sizes=[(16, 16), (32, 32)])
print(f"Wrote legacy alias {os.path.join(brand, 'ss-tab.ico')}")
PY`,
  { cwd: root, stdio: "inherit" },
);

manifest.assets["mark.ico"] = { md5: md5(readFileSync(join(brandDir, "mark.ico"))) };

writeFileSync(
  join(root, "src/lib/brand/mark.generated.ts"),
  `/** AUTO-GENERATED from public/brand/mark.svg — do not edit. Run: npm run brand:generate */\nexport const BRAND_MARK_SVG = ${JSON.stringify(svg)};\nexport const BRAND_MARK_SVG_MD5 = ${JSON.stringify(manifest.svgMd5)};\n`,
);

writeFileSync(
  join(brandDir, "mark.manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Wrote ${join(brandDir, "mark.manifest.json")}`);

console.log("Brand assets generated from public/brand/mark.svg");
