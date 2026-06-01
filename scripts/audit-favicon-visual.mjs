/**
 * Visual favicon audit with screenshots + pixel diff artifacts.
 * Usage: npm run audit:favicon:visual [baseUrl]
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const outDir = join(root, "artifacts", "brand-audit");
const historyRoot = join(outDir, "history");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = join(historyRoot, runId);

mkdirSync(outDir, { recursive: true });
mkdirSync(historyRoot, { recursive: true });
mkdirSync(runDir, { recursive: true });

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
print((changed / total) * 100)
`;
  const out = execSync(`python3 - <<'PY'\n${script}\nPY`, { cwd: root, encoding: "utf8" }).trim();
  return parseFloat(out);
}

function playwrightProxyFromEnv() {
  const raw =
    process.env.INDEX_PROXY_URL?.trim() ??
    process.env.DECODO_PROXY_URL?.trim() ??
    process.env.INDEX_PROXY_LIST?.split(/[,;\n|]+/).map((s) => s.trim()).find(Boolean);
  if (!raw) return undefined;
  try {
    const p = new URL(raw);
    return {
      server: `${p.protocol}//${p.hostname}${p.port ? `:${p.port}` : ""}`,
      username: p.username ? decodeURIComponent(p.username) : undefined,
      password: p.password ? decodeURIComponent(p.password) : undefined,
    };
  } catch {
    return undefined;
  }
}

let browser;
try {
  browser = await chromium.launch({ proxy: playwrightProxyFromEnv() });
} catch (e) {
  console.error("[audit:favicon:visual] Playwright browser missing.");
  console.error("Run: npx playwright install chromium");
  console.error(String(e));
  process.exit(1);
}
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const classCounts = new Map();
const classify = (request) => {
  const type = request.resourceType();
  const url = request.url();
  if (type === "image" || /\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(url)) return "image";
  if (type === "font" || /\.(woff2?|ttf|otf)(\?|$)/i.test(url)) return "font";
  if (type === "media" || /\.(mp4|mp3|webm)(\?|$)/i.test(url)) return "media";
  if (/google-analytics|googletagmanager|doubleclick|segment|hotjar|sentry|newrelic|datadog/i.test(url))
    return "analytics";
  if (/facebook\.net|pixel|tracker|beacon/i.test(url)) return "tracker";
  return "other";
};
const bump = (key, blockedFlag) => {
  const row = classCounts.get(key) ?? { blocked: 0, allowed: 0 };
  if (blockedFlag) row.blocked += 1;
  else row.allowed += 1;
  classCounts.set(key, row);
};
await page.route("**/*", async (route, request) => {
  const type = request.resourceType();
  const url = request.url();
  const cls = classify(request);
  if (type === "font" || type === "media") {
    bump(cls, true);
    return route.abort();
  }
  if (
    /google-analytics|googletagmanager|doubleclick|segment|hotjar|sentry|newrelic|datadog|facebook\.net|pixel/i.test(
      url,
    )
  ) {
    bump(cls, true);
    return route.abort();
  }
  if (/\.(woff2?|ttf|otf|mp4|mp3|webm)(\?|$)/i.test(url)) {
    bump(cls, true);
    return route.abort();
  }
  // Keep brand images required for parity screenshots.
  bump(cls, false);
  return route.continue();
});
await page.goto(`${baseUrl}/debug/icons?brandParity=1`, { waitUntil: "networkidle" });

const navbar = page.locator('[data-testid="navbar-icon"] img').first();
const favicon = page.locator('[data-testid="favicon-icon"]').first();
const surrogate16 = page.locator('[data-testid="tab-surrogate-16"]').first();

const navbarPath = join(outDir, "navbar-icon.png");
const faviconPath = join(outDir, "favicon-icon.png");
const surrogatePath = join(outDir, "tab-surrogate-16.png");
const pagePath = join(outDir, "debug-icons-page.png");

await page.screenshot({ path: pagePath, fullPage: true });
await navbar.screenshot({ path: navbarPath });
await favicon.screenshot({ path: faviconPath });
await surrogate16.screenshot({ path: surrogatePath });
await page.screenshot({ path: join(runDir, "debug-icons-page.png"), fullPage: true });
await navbar.screenshot({ path: join(runDir, "navbar-icon.png") });
await favicon.screenshot({ path: join(runDir, "favicon-icon.png") });
await surrogate16.screenshot({ path: join(runDir, "tab-surrogate-16.png") });
const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
const runtimeFavicon = await page.evaluate(
  () => document.querySelector('link[rel="icon"]')?.getAttribute("href") ?? "",
);

await browser.close();

const navbarVsFavicon = pixelDiffPct(navbarPath, faviconPath);
const surrogateVsFavicon = pixelDiffPct(surrogatePath, faviconPath);
const threshold = 0.75;

console.log("\n=== Favicon visual audit ===");
console.log(`Base URL: ${baseUrl}`);
console.log(`navbar vs favicon diff: ${navbarVsFavicon.toFixed(4)}%`);
console.log(`surrogate16 vs favicon diff: ${surrogateVsFavicon.toFixed(4)}%`);
console.log(`Artifacts: ${outDir}`);

const report = {
  runId,
  timestamp: new Date().toISOString(),
  baseUrl,
  browser: "chromium",
  devicePixelRatio: dpr,
  runtimeFaviconHref: runtimeFavicon,
  navbarVsFaviconPct: Number(navbarVsFavicon.toFixed(6)),
  surrogateVsFaviconPct: Number(surrogateVsFavicon.toFixed(6)),
  thresholdPct: threshold,
  artifacts: {
    latest: {
      page: "artifacts/brand-audit/debug-icons-page.png",
      navbar: "artifacts/brand-audit/navbar-icon.png",
      favicon: "artifacts/brand-audit/favicon-icon.png",
      surrogate: "artifacts/brand-audit/tab-surrogate-16.png",
    },
    run: {
      page: `artifacts/brand-audit/history/${runId}/debug-icons-page.png`,
      navbar: `artifacts/brand-audit/history/${runId}/navbar-icon.png`,
      favicon: `artifacts/brand-audit/history/${runId}/favicon-icon.png`,
      surrogate: `artifacts/brand-audit/history/${runId}/tab-surrogate-16.png`,
    },
  },
  requestComposition: [...classCounts.entries()].map(([className, c]) => ({
    className,
    blocked: c.blocked,
    allowed: c.allowed,
  })),
};
writeFileSync(join(outDir, "latest-visual-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (navbarVsFavicon > threshold || surrogateVsFavicon > threshold) {
  console.error(
    `FAIL visual divergence above ${threshold}% (navbar=${navbarVsFavicon.toFixed(3)} surrogate=${surrogateVsFavicon.toFixed(3)})`,
  );
  process.exit(1);
}

console.log("PASS visual parity within threshold.");
