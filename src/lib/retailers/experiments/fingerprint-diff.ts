/**
 * Fingerprint capture + diff between challenged vs successful sessions.
 */
import type { RealismSignals } from "../browser-realism";
import type { FingerprintDiffEntry, FingerprintSnapshot, ExtendedFingerprint } from "./types";

/** Script evaluated in-page for extended fingerprint (experiments only). */
export const EXTENDED_FINGERPRINT_PROBE = `
(() => {
  const nav = navigator;
  let webglVendor = null, webglRenderer = null, canvasHash = null;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {}
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillText('fp', 2, 2);
      canvasHash = String(c.toDataURL().length);
    }
  } catch (e) {}
  return {
    webdriver: nav.webdriver ?? null,
    userAgent: nav.userAgent,
    platform: nav.platform,
    languages: nav.languages ? Array.from(nav.languages) : [nav.language],
    language: nav.language,
    hardwareConcurrency: nav.hardwareConcurrency ?? 0,
    deviceMemory: nav.deviceMemory ?? null,
    pluginsLength: nav.plugins ? nav.plugins.length : 0,
    webglVendor,
    webglRenderer,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio ?? 1,
    hasChromeObject: typeof window.chrome !== 'undefined',
    canvasHash,
    permissionsConsistent: null,
    cookieEnabled: nav.cookieEnabled,
    localStorageAvailable: (() => { try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; } catch(e) { return false; } })(),
    sessionStorageAvailable: (() => { try { sessionStorage.setItem('_t','1'); sessionStorage.removeItem('_t'); return true; } catch(e) { return false; } })(),
    performanceNow: performance.now(),
    dateOffsetMs: Date.now() - performance.timeOrigin,
  };
})()
`;

export function snapshotFromSignals(
  signals: RealismSignals | ExtendedFingerprint,
  coherenceScore?: number,
): FingerprintSnapshot {
  const ext = signals as ExtendedFingerprint;
  return {
    capturedAt: new Date().toISOString(),
    signals,
    coherenceScore,
    storageAvailable: Boolean(ext.localStorageAvailable && ext.sessionStorageAvailable),
    cookieEnabled: ext.cookieEnabled ?? true,
  };
}

const DIFF_FIELDS: Array<keyof RealismSignals | keyof ExtendedFingerprint> = [
  "webdriver",
  "platform",
  "language",
  "languages",
  "timezone",
  "locale",
  "webglVendor",
  "webglRenderer",
  "hardwareConcurrency",
  "deviceMemory",
  "pluginsLength",
  "innerWidth",
  "innerHeight",
  "devicePixelRatio",
  "canvasHash",
  "hasChromeObject",
  "cookieEnabled",
  "localStorageAvailable",
  "sessionStorageAvailable",
];

export function diffFingerprints(
  successful: FingerprintSnapshot | undefined,
  challenged: FingerprintSnapshot | undefined,
): FingerprintDiffEntry[] {
  if (!successful || !challenged) return [];
  const diffs: FingerprintDiffEntry[] = [];
  for (const field of DIFF_FIELDS) {
    const a = (successful.signals as Record<string, unknown>)[field];
    const b = (challenged.signals as Record<string, unknown>)[field];
    const same = JSON.stringify(a) === JSON.stringify(b);
    if (!same) {
      diffs.push({
        field,
        baseline: a,
        challenged: b,
        delta: `${JSON.stringify(a)} → ${JSON.stringify(b)}`,
      });
    }
  }
  if (successful.coherenceScore !== challenged.coherenceScore) {
    diffs.push({
      field: "coherenceScore",
      baseline: successful.coherenceScore,
      challenged: challenged.coherenceScore,
    });
  }
  return diffs;
}
