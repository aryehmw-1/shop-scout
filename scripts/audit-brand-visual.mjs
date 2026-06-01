/**
 * Pixel-level visual diff audit — navbar PNG must match favicon PNG at each size.
 * Usage: npm run audit:brand:visual
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const markSvg = join(root, "public/brand/mark.svg");
const brandDir = join(root, "public/brand");
const tmpDir = join(root, ".tmp/brand-visual-audit");

const MAX_DIFF_PCT = 0.5;

function md5(buf) {
  return createHash("md5").update(buf).digest("hex");
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const checks = [];

execSync(`mkdir -p ${tmpDir}`, { cwd: root });

function renderFresh(size, out) {
  execSync(
    `npx --yes @resvg/resvg-js-cli --fit-width ${size} --fit-height ${size} ${markSvg} ${out}`,
    { cwd: root, stdio: "pipe" },
  );
}

function pixelDiffPct(pathA, pathB) {
  const script = `
from PIL import Image, ImageChops
a = Image.open("${pathA}").convert("RGBA")
b = Image.open("${pathB}").convert("RGBA")
if a.size != b.size:
    b = b.resize(a.size, Image.Resampling.LANCZOS)
diff = ImageChops.difference(a, b)
pixels = list(diff.getdata())
changed = sum(1 for r,g,b,a_ in pixels if r > 8 or g > 8 or b > 8 or a_ > 8)
total = a.size[0] * a.size[1]
pct = (changed / total) * 100
print(f"{pct:.4f}")
`;
  const out = execSync(`python3 - <<'PY'\n${script}\nPY`, { cwd: root, encoding: "utf8" }).trim();
  return parseFloat(out);
}

for (const size of [16, 32]) {
  const fresh = join(tmpDir, `fresh-${size}.png`);
  const asset = join(brandDir, `mark-${size}.png`);
  renderFresh(size, fresh);
  const diff = pixelDiffPct(fresh, asset);
  checks.push(
    check(
      `${size}px PNG pixel diff vs fresh SVG render`,
      diff <= MAX_DIFF_PCT,
      `${diff.toFixed(3)}% changed (max ${MAX_DIFF_PCT}%)`,
    ),
  );
}

const mark32 = join(brandDir, "mark-32.png");
const brandHomeMark = readFileSync(
  join(root, "src/components/brand/BrandHomeMark.tsx"),
  "utf8",
);

checks.push(
  check(
    "BrandHomeMark uses BRAND_NAV_ICON_URL (mark-32.png)",
    brandHomeMark.includes("BRAND_NAV_ICON_URL"),
  ),
);
checks.push(
  check(
    "BrandHomeMark renders img (same raster as favicon)",
    brandHomeMark.includes("<img") && brandHomeMark.includes("mark-config"),
  ),
);
checks.push(
  check(
    "BrandHomeMark has no CSS rounded-xl/shadow distortion",
    !brandHomeMark.includes("rounded-xl") && !brandHomeMark.includes("shadow-lg"),
  ),
);
checks.push(
  check(
    "Navbar md size is 32px (favicon parity)",
    brandHomeMark.includes("px: 32") && brandHomeMark.includes('"md"'),
  ),
);

checks.push(
  check(
    "NAV_ICON equals ICON_32 in mark-config",
    readFileSync(join(root, "src/lib/brand/mark-config.ts"), "utf8").includes(
      "BRAND_NAV_ICON_URL = BRAND_ICON_32_URL",
    ),
  ),
);

const navSim = join(tmpDir, "navbar-sim-32.png");
execSync(`cp ${mark32} ${navSim}`);
checks.push(
  check(
    "Navbar simulation bytes === mark-32.png (favicon file)",
    md5(readFileSync(navSim)) === md5(readFileSync(mark32)),
  ),
);

for (const scale of [2]) {
  const retina = join(tmpDir, `retina-${scale}x.png`);
  execSync(
    `python3 - <<'PY'
from PIL import Image
im = Image.open("${mark32}").convert("RGBA")
im.resize((im.size[0]*${scale}, im.size[1]*${scale}), Image.Resampling.NEAREST).save("${retina}")
PY`,
    { cwd: root, stdio: "pipe" },
  );
  const base2x = join(tmpDir, "fresh-32-2x.png");
  renderFresh(32, join(tmpDir, "fresh-32-check.png"));
  execSync(
    `python3 - <<'PY'
from PIL import Image
im = Image.open("${join(tmpDir, "fresh-32-check.png")}").convert("RGBA")
im.resize((64, 64), Image.Resampling.NEAREST).save("${base2x}")
PY`,
    { cwd: root, stdio: "pipe" },
  );
  const retinaDiff = pixelDiffPct(retina, base2x);
  checks.push(
    check(
      `32px @${scale}x retina nearest-neighbor diff`,
      retinaDiff <= MAX_DIFF_PCT,
      `${retinaDiff.toFixed(3)}%`,
    ),
  );
}

const failed = checks.filter((c) => !c);
console.log(`\n=== Brand visual diff: ${checks.length - failed.length}/${checks.length} passed ===`);

if (failed.length) {
  console.error("\nFix: npm run brand:generate && npm run audit:brand:visual");
  process.exit(1);
}

console.log("\nNavbar (mark-32.png @ 32px) and tab favicon are pixel-identical.");
