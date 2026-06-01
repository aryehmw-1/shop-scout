import { sleep } from "./session-behavior";

export type WarmupMode = "none" | "simple" | "homepage";

export interface WarmSessionStage {
  stage: string;
  atMs: number;
  note?: string;
}

/** Stable Walmart category landing pages (not search). */
const WALMART_CATEGORY_PAGES = [
  { label: "grocery", url: "https://www.walmart.com/cp/grocery/976759" },
  { label: "electronics", url: "https://www.walmart.com/cp/electronics/3944" },
  { label: "home", url: "https://www.walmart.com/cp/home/4044" },
  { label: "health", url: "https://www.walmart.com/cp/pharmacy-health-wellness/1071966" },
];

export interface WarmSessionPage {
  goto: (
    url: string,
    opts: { waitUntil?: string; timeout?: number },
  ) => Promise<unknown>;
  evaluate: <T>(fn: () => T | Promise<T>) => Promise<T>;
  mouse: { wheel: (deltaX: number, deltaY: number) => Promise<void> };
  url: () => string;
}

function pushStage(
  stages: WarmSessionStage[],
  name: string,
  startedAt: number,
  note?: string,
): void {
  stages.push({ stage: name, atMs: Date.now() - startedAt, note });
}

function randBetween(lo: number, hi: number): number {
  return Math.round(lo + Math.random() * (hi - lo));
}

/**
 * Walmart homepage warm-session flow before SERP navigation:
 * homepage → idle → scroll → category page → idle → ready for search.
 * Best-effort; records lifecycle stages even on partial failure.
 */
export async function runWalmartHomepageWarmSession(
  page: WarmSessionPage,
  homepageUrl: string,
  navTimeoutMs: number,
  startedAt: number,
): Promise<WarmSessionStage[]> {
  const stages: WarmSessionStage[] = [];
  const navCap = Math.min(navTimeoutMs, 25000);

  try {
    await page.goto(homepageUrl, { waitUntil: "commit", timeout: navCap });
    pushStage(stages, "warmup_homepage_committed", startedAt);
  } catch (e) {
    pushStage(stages, "warmup_homepage_timeout", startedAt, String(e).slice(0, 80));
    return stages;
  }

  const homepageIdleMs = randBetween(3000, 7000);
  await sleep(homepageIdleMs);
  pushStage(stages, "warmup_homepage_idle", startedAt, `ms=${homepageIdleMs}`);

  const scrollSteps = randBetween(2, 4);
  for (let i = 0; i < scrollSteps; i++) {
    await page.mouse.wheel(0, randBetween(160, 540)).catch(() => {});
    await sleep(randBetween(220, 780));
  }
  pushStage(stages, "warmup_homepage_scroll", startedAt, `steps=${scrollSteps}`);

  const fallback =
    WALMART_CATEGORY_PAGES[Math.floor(Math.random() * WALMART_CATEGORY_PAGES.length)]!;
  let categoryLabel = fallback.label;
  let navigatedVia = "click";

  try {
    const clickedHref = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/cp/"], a[href*="/browse/"]'))
        .filter((a) => {
          const href = a.getAttribute("href") ?? "";
          return href.length > 1 && !/\/search\b/i.test(href);
        }) as HTMLAnchorElement[];
      if (!links.length) return null;
      const pick = links[Math.floor(Math.random() * links.length)]!;
      pick.click();
      return pick.href || pick.getAttribute("href");
    });
    if (clickedHref) {
      pushStage(stages, "warmup_category_click", startedAt, clickedHref.slice(0, 80));
      await sleep(randBetween(1200, 2200));
    } else {
      throw new Error("no_category_link");
    }
  } catch {
    navigatedVia = "goto";
    categoryLabel = fallback.label;
    try {
      await page.goto(fallback.url, { waitUntil: "commit", timeout: navCap });
      pushStage(stages, "warmup_category_goto", startedAt, fallback.label);
    } catch (e) {
      pushStage(stages, "warmup_category_failed", startedAt, String(e).slice(0, 80));
      return stages;
    }
  }

  const categoryIdleMs = randBetween(1500, 3500);
  await sleep(categoryIdleMs);
  pushStage(
    stages,
    "warmup_category_idle",
    startedAt,
    `ms=${categoryIdleMs},via=${navigatedVia},cat=${categoryLabel}`,
  );

  await page.mouse.wheel(0, randBetween(200, 480)).catch(() => {});
  await sleep(randBetween(400, 1000));
  pushStage(stages, "warmup_pre_search_ready", startedAt, categoryLabel);

  return stages;
}

/** Resolve warmup mode from explicit option + transport/behavior defaults. */
export function resolveWarmupMode(
  warmup: boolean | "homepage" | undefined,
  multiStepWarmup: boolean,
  transport: string,
): WarmupMode {
  if (warmup === "homepage") return "homepage";
  if (warmup === false) return "none";
  if (warmup === true) return "simple";
  if (multiStepWarmup || transport === "residential") return "simple";
  return "none";
}
