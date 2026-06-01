/**
 * Browser-realism toolkit for the rendered executor: a stealth init script,
 * an in-page fingerprint probe, and pure scoring functions that turn the probe
 * output into a bot-suspicion score and a challenge-probability score. The
 * scoring functions are deterministic and unit-testable (no browser needed).
 */

export interface RealismSignals {
  webdriver: boolean | null;
  userAgent: string;
  platform: string;
  languages: string[];
  language: string;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  pluginsLength: number;
  webglVendor: string | null;
  webglRenderer: string | null;
  timezone: string;
  locale: string;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  hasChromeObject: boolean;
  canvasHash: string | null;
  permissionsConsistent: boolean | null;
}

export interface BotSuspicion {
  score: number; // 0..1, higher = more bot-like
  reasons: string[];
}

export interface ChallengeProbability {
  score: number; // 0..1
  factors: string[];
}

/**
 * Init script injected before any page script runs. Masks the most common
 * automation tells. Kept conservative — over-spoofing is itself a tell.
 */
export const STEALTH_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  } catch (e) {}
  try {
    if (!window.chrome) {
      window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
    }
  } catch (e) {}
  try {
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : ['en-US', 'en'];
    Object.defineProperty(navigator, 'languages', { get: () => langs });
  } catch (e) {}
  try {
    if (!navigator.plugins || navigator.plugins.length === 0) {
      const fake = [1, 2, 3].map((i) => ({ name: 'Plugin ' + i, filename: 'p' + i + '.dll', description: '' }));
      Object.defineProperty(navigator, 'plugins', { get: () => fake });
    }
  } catch (e) {}
  try {
    const orig = navigator.permissions && navigator.permissions.query;
    if (orig) {
      navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : orig(params);
    }
  } catch (e) {}
  try {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel Iris OpenGL Engine';
      return getParam.call(this, p);
    };
  } catch (e) {}
})();
`;

/**
 * The function evaluated in-page to collect fingerprint signals. Exported as a
 * string-returning function so the executor can pass it to page.evaluate.
 */
export function realismProbe(): RealismSignals {
  // This body runs in the browser context (serialized by Playwright).
  const nav = navigator as unknown as {
    webdriver?: boolean;
    userAgent: string;
    platform: string;
    languages?: string[];
    language: string;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    plugins?: { length: number };
  };
  let webglVendor: string | null = null;
  let webglRenderer: string | null = null;
  let canvasHash: string | null = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string;
        webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("realism-probe", 2, 2);
      const data = c.toDataURL();
      let h = 0;
      for (let i = 0; i < data.length; i++) h = (h * 31 + data.charCodeAt(i)) | 0;
      canvasHash = String(h);
    }
  } catch {
    /* ignore */
  }
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "";
    }
  })();
  const locale = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      return "";
    }
  })();
  return {
    webdriver: nav.webdriver ?? null,
    userAgent: nav.userAgent,
    platform: nav.platform,
    languages: nav.languages ?? [],
    language: nav.language,
    hardwareConcurrency: nav.hardwareConcurrency ?? 0,
    deviceMemory: nav.deviceMemory ?? null,
    pluginsLength: nav.plugins?.length ?? 0,
    webglVendor,
    webglRenderer,
    timezone: tz,
    locale,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    hasChromeObject: typeof (window as unknown as { chrome?: unknown }).chrome !== "undefined",
    canvasHash,
    permissionsConsistent: null,
  };
}

/** Pure: turn realism signals into a bot-suspicion score (0..1). */
export function botSuspicionScore(s: RealismSignals): BotSuspicion {
  const reasons: string[] = [];
  let score = 0;
  const add = (w: number, reason: string) => {
    score += w;
    reasons.push(reason);
  };

  if (s.webdriver === true) add(0.4, "navigator.webdriver=true");
  if (!s.hasChromeObject) add(0.1, "missing window.chrome");
  if (s.pluginsLength === 0) add(0.1, "no navigator.plugins");
  if (!s.languages || s.languages.length === 0) add(0.1, "empty navigator.languages");
  if (/headless/i.test(s.userAgent)) add(0.3, "headless in user-agent");
  if (!s.webglVendor && !s.webglRenderer) add(0.1, "no WebGL vendor/renderer");
  if (/swiftshader|llvmpipe|mesa/i.test(`${s.webglVendor} ${s.webglRenderer}`))
    add(0.15, "software WebGL renderer (headless tell)");
  if (s.hardwareConcurrency === 0) add(0.05, "hardwareConcurrency=0");
  if (s.deviceMemory === null) add(0.03, "deviceMemory undefined");
  // UA/platform consistency
  const uaSaysMac = /Macintosh/i.test(s.userAgent);
  const uaSaysWin = /Windows/i.test(s.userAgent);
  if (uaSaysMac && s.platform && !/mac/i.test(s.platform)) add(0.15, "UA=Mac but platform mismatch");
  if (uaSaysWin && s.platform && !/win/i.test(s.platform)) add(0.15, "UA=Windows but platform mismatch");
  // locale/timezone presence
  if (!s.timezone) add(0.05, "no resolved timezone");
  if (!s.locale) add(0.05, "no resolved locale");

  return { score: Math.min(1, Math.round(score * 100) / 100), reasons };
}

export interface ChallengeProbabilityInput {
  suspicion: number;
  /** Recent block rate for this retailer+strategy (0..1). */
  recentBlockRate?: number;
  /** Static retailer difficulty (0..1). */
  retailerDifficulty?: number;
  proxyUsed?: boolean;
}

/** Pure: estimate probability the next request gets challenged. */
export function challengeProbabilityScore(input: ChallengeProbabilityInput): ChallengeProbability {
  const factors: string[] = [];
  const suspicion = clamp01(input.suspicion);
  const block = clamp01(input.recentBlockRate ?? 0);
  const difficulty = clamp01(input.retailerDifficulty ?? 0.3);

  // Weighted blend; recent observed blocks dominate, suspicion + difficulty add.
  let score = 0.5 * block + 0.3 * suspicion + 0.2 * difficulty;
  factors.push(`block=${block}`, `suspicion=${suspicion}`, `difficulty=${difficulty}`);
  if (input.proxyUsed) {
    score *= 0.9; // datacenter proxy gives a small benefit on some retailers
    factors.push("proxy_adjustment");
  }
  return { score: Math.min(1, Math.round(score * 100) / 100), factors };
}

/** Static, tunable per-retailer anti-bot difficulty (0..1). */
export const RETAILER_DIFFICULTY: Record<string, number> = {
  amazon: 0.2,
  walmart: 0.6,
  target: 0.6,
  kroger: 0.8,
  costco: 0.85,
  instacart: 0.7,
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
