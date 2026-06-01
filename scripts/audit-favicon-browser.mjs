/**
 * Browser-level favicon verification (Chromium + WebKit).
 * Usage: npm run audit:favicon:browser [baseUrl]
 */
import { chromium, webkit } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const baseUrl = process.argv[2] ?? "http://127.0.0.1:3456";
const outDir = join(root, ".tmp/favicon-audit");
mkdirSync(outDir, { recursive: true });
const artifactRoot = join(root, "artifacts", "brand-audit");
const historyRoot = join(artifactRoot, "history");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = join(historyRoot, runId);
mkdirSync(artifactRoot, { recursive: true });
mkdirSync(historyRoot, { recursive: true });
mkdirSync(runDir, { recursive: true });

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
const launchProxy = playwrightProxyFromEnv();

const browsers = [
  { name: "chromium", type: chromium },
  { name: "webkit", type: webkit },
];
const runResults = [];

for (const { name, type } of browsers) {
  let browser;
  try {
    browser = await type.launch({ proxy: launchProxy });
  } catch (e) {
    console.error(`[audit:favicon:browser] Missing ${name} browser binary.`);
    console.error("Run: npx playwright install chromium webkit");
    console.error(String(e));
    process.exit(1);
  }
  const page = await browser.newPage();
  const iconRequests = [];
  let blocked = 0;
  const classCounts = new Map();

  const classify = (req) => {
    const type = req.resourceType();
    const url = req.url();
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

  await page.route("**/*", async (route, req) => {
    const url = req.url();
    const type = req.resourceType();
    const cls = classify(req);
    if (
      type === "font" ||
      type === "media" ||
      /google-analytics|googletagmanager|doubleclick|segment|hotjar|sentry|newrelic|datadog|facebook\.net|pixel/i.test(
        url,
      ) ||
      /\.(woff2?|ttf|otf|mp4|mp3|webm)(\?|$)/i.test(url)
    ) {
      blocked += 1;
      bump(cls, true);
      await route.abort();
      return;
    }
    bump(cls, false);
    await route.continue();
  });

  page.on("request", (req) => {
    const url = req.url();
    if (/favicon|\/icon|apple-icon|brand\/icon\.svg/i.test(url)) {
      iconRequests.push(url);
    }
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outDir, `${name}-page.png`), fullPage: false });

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]')].map(
      (el) => ({ rel: el.rel, href: el.href, type: el.type, sizes: el.sizes?.toString() ?? "" }),
    ),
  );

  console.log(`\n=== ${name} ===`);
  console.log("Head icon links:", JSON.stringify(links, null, 2));
  console.log("Network icon requests:", iconRequests);
  console.log("Blocked asset requests:", blocked);
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  runResults.push({
    browser: name,
    links,
    iconRequests,
    blockedAssetRequests: blocked,
    requestComposition: [...classCounts.entries()].map(([className, c]) => ({
      className,
      blocked: c.blocked,
      allowed: c.allowed,
    })),
    devicePixelRatio: dpr,
    screenshot: `artifacts/brand-audit/history/${runId}/${name}-page.png`,
  });
  await page.screenshot({ path: join(runDir, `${name}-page.png`), fullPage: false });

  await browser.close();
}

console.log("\nBrowser audit complete. Screenshots in .tmp/favicon-audit/");
const report = {
  runId,
  timestamp: new Date().toISOString(),
  baseUrl,
  proxyConfigured: Boolean(launchProxy),
  browsers: runResults,
};
writeFileSync(join(artifactRoot, "latest-browser-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(runDir, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
