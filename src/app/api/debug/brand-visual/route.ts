import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { BRAND_ICON_32_URL, brandAssetUrl } from "@/lib/brand/mark-config";

const ROOT = process.cwd();
const brandDir = join(ROOT, "public/brand");
const markSvg = join(brandDir, "mark.svg");
const tmpDir = join(ROOT, ".tmp/brand-visual-api");

function md5File(path: string): string {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

function pixelDiffPct(pathA: string, pathB: string): number {
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
print((changed / total) * 100)
`;
  const out = execSync(`python3 - <<'PY'\n${script}\nPY`, { encoding: "utf8" }).trim();
  return parseFloat(out);
}

export async function GET() {
  try {
    execSync(`mkdir -p ${tmpDir}`);

    const sizes = [16, 32] as const;
    const comparisons: Array<{
      size: number;
      diffPct: number;
      pass: boolean;
      assetMd5: string;
      freshMd5: string;
    }> = [];

    for (const size of sizes) {
      const fresh = join(tmpDir, `fresh-${size}.png`);
      const asset = join(brandDir, `mark-${size}.png`);
      execSync(
        `npx --yes @resvg/resvg-js-cli --fit-width ${size} --fit-height ${size} ${markSvg} ${fresh}`,
        { stdio: "pipe" },
      );
      const diffPct = pixelDiffPct(fresh, asset);
      comparisons.push({
        size,
        diffPct,
        pass: diffPct <= 0.5,
        assetMd5: md5File(asset),
        freshMd5: md5File(fresh),
      });
    }

    const mark32 = join(brandDir, "mark-32.png");
    const brandHomeMarkSrc = readFileSync(
      join(ROOT, "src/components/brand/BrandHomeMark.tsx"),
      "utf8",
    );
    const faviconStat = statSync(mark32);
    const manifest = existsSync(join(brandDir, "mark.manifest.json"))
      ? JSON.parse(readFileSync(join(brandDir, "mark.manifest.json"), "utf8"))
      : null;
    const faviconUrl = brandAssetUrl(BRAND_ICON_32_URL);
    const faviconHash = md5File(mark32);

    return NextResponse.json({
      ok: comparisons.every((c) => c.pass),
      navbarUses: "/brand/mark-32.png",
      faviconUses: "/brand/mark-32.png",
      faviconUrl,
      faviconHash,
      lastModified: faviconStat.mtime.toISOString(),
      etag: `"${faviconHash}"`,
      renderingFlags: {
        imageRenderingCrispEdges: /imageRendering:\s*["']crisp-edges["']/.test(brandHomeMarkSrc),
        transformScaleApplied: /transform:\s*["']scale/.test(brandHomeMarkSrc),
        roundedClassPresent: /rounded-/.test(brandHomeMarkSrc),
        shadowClassPresent: /shadow-/.test(brandHomeMarkSrc),
        fixedCssDimensions32: /px:\s*32/.test(brandHomeMarkSrc),
      },
      parity: "Navbar and favicon are both forced to /brand/mark-32.png (32×32 PNG) for optical debugging.",
      comparisons,
      manifest,
      tips: [
        "Hard-refresh Safari: Develop → Empty Caches, or use private window",
        "Compare localhost vs 127.0.0.1 separately — cache is per-origin",
        "Do not add CSS border-radius or shadow on the brand mark wrapper",
      ],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Visual audit failed" },
      { status: 500 },
    );
  }
}
