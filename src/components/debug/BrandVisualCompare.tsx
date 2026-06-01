"use client";

import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { useEffect, useState } from "react";

const FORCE_PARITY_STORAGE_KEY = "brand.force.parity";

interface VisualAudit {
  ok: boolean;
  comparisons: Array<{ size: number; diffPct: number; pass: boolean }>;
  parity: string;
  tips: string[];
  faviconUrl?: string;
  faviconHash?: string;
  lastModified?: string;
  etag?: string;
  renderingFlags?: Record<string, boolean>;
}

export function BrandVisualCompare() {
  const [audit, setAudit] = useState<VisualAudit | null>(null);
  const [forcedParity, setForcedParity] = useState(true);
  const [runtimeFaviconHref, setRuntimeFaviconHref] = useState<string>("");
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    fetch("/api/debug/brand-visual")
      .then((r) => r.json())
      .then(setAudit)
      .catch(() => setAudit(null));

    const stored = localStorage.getItem(FORCE_PARITY_STORAGE_KEY);
    setForcedParity(stored !== "0");
    const el = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    setRuntimeFaviconHref(el?.href ?? "");
    setDpr(window.devicePixelRatio || 1);
  }, []);

  function toggleForcedParity(next: boolean) {
    localStorage.setItem(FORCE_PARITY_STORAGE_KEY, next ? "1" : "0");
    setForcedParity(next);
    window.dispatchEvent(new Event("brand:parity-mode"));
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4">
        <p className="font-semibold text-violet-900">Forced parity mode (temporary debug)</p>
        <p className="mt-1 text-sm text-violet-800">
          ON = navbar uses exact favicon PNG (`mark-32.png`) at 32x32 with no visual modifiers.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleForcedParity(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              forcedParity ? "bg-violet-700 text-white" : "bg-white text-violet-800 ring-1 ring-violet-300"
            }`}
          >
            Forced parity ON
          </button>
          <button
            type="button"
            onClick={() => toggleForcedParity(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              !forcedParity ? "bg-violet-700 text-white" : "bg-white text-violet-800 ring-1 ring-violet-300"
            }`}
          >
            Forced parity OFF
          </button>
          <span className="text-xs text-violet-700">Current: {forcedParity ? "ON" : "OFF"}</span>
        </div>
      </div>

      <div className="rounded-xl border border-sage-200 bg-sage-50/80 p-4">
        <p className="font-semibold text-sage-900">Live navbar vs tab icon (no CSS filters)</p>
        <p className="mt-1 text-sm text-sage-800">
          Left: <code className="text-xs">BrandHomeMark</code> (navbar). Right:{" "}
          <code className="text-xs">mark-32.png</code> (favicon PNG). Both at 32×32.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-10">
          <div className="text-center">
            <div data-testid="navbar-icon">
              <BrandHomeMark size="md" />
            </div>
            <p className="mt-2 text-xs font-medium">Navbar component</p>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="favicon-icon"
              src="/brand/mark-32.png"
              alt="Favicon PNG"
              width={32}
              height={32}
              style={{ width: 32, height: 32, imageRendering: "crisp-edges" }}
            />
            <p className="mt-2 text-xs font-medium">Tab PNG (32)</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4">
        <p className="font-semibold text-indigo-900">Tab surrogate diagnostics</p>
        <p className="mt-1 text-sm text-indigo-800">
          Simulates browser-tab constraints (16x16, grayscale, low-contrast backgrounds, retina).
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { label: "Light tab", bg: "bg-white" },
            { label: "Dark tab", bg: "bg-stone-900" },
            { label: "Grayscale tab", bg: "bg-stone-100 grayscale" },
            { label: "Retina 2x (scaled)", bg: "bg-slate-100" },
          ].map((s, i) => (
            <div key={s.label} className={`rounded-lg border border-indigo-200 p-3 ${s.bg}`}>
              <p className={`mb-2 text-xs ${i === 1 ? "text-white" : "text-indigo-900"}`}>{s.label}</p>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid={i === 0 ? "tab-surrogate-16" : undefined}
                  src="/brand/mark-32.png"
                  alt=""
                  width={16}
                  height={16}
                  style={{
                    width: 16,
                    height: 16,
                    imageRendering: i === 3 ? "pixelated" : "auto",
                    filter: i === 2 ? "grayscale(100%)" : "none",
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/mark-32.png"
                  alt=""
                  width={32}
                  height={32}
                  style={{
                    width: 32,
                    height: 32,
                    imageRendering: i === 3 ? "pixelated" : "auto",
                    transform: i === 3 ? "scale(0.5)" : "none",
                    transformOrigin: "left center",
                    filter: i === 2 ? "grayscale(100%)" : "none",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-indigo-800">
          Current `devicePixelRatio`: <code>{dpr.toFixed(2)}</code>
        </p>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <p className="font-semibold text-ink-900">Multi-size check (1× and 2× retina)</p>
        <div className="mt-4 flex flex-wrap items-end gap-8">
          {[16, 32, 48].map((px) => (
            <div key={px} className="text-center">
              <div className="flex items-end justify-center gap-3">
                <BrandHomeMark size={px <= 32 ? "md" : "lg"} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={px <= 16 ? "/brand/mark-16.png" : "/brand/mark-32.png"}
                  alt=""
                  width={px <= 32 ? 32 : 48}
                  height={px <= 32 ? 32 : 48}
                  style={{
                    width: px <= 32 ? 32 : 48,
                    height: px <= 32 ? 32 : 48,
                    imageRendering: "crisp-edges",
                  }}
                />
              </div>
              <p className="mt-2 text-[10px] text-ink-500">{px}dp reference</p>
            </div>
          ))}
        </div>
      </div>

      {audit && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            audit.ok ?
              "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-red-200 bg-red-50 text-red-950"
          }`}
        >
          <p className="font-semibold">
            Pixel diff audit: {audit.ok ? "PASS" : "FAIL"}
          </p>
          <p className="mt-1">{audit.parity}</p>
          <p className="mt-2 text-xs">
            Favicon URL: <code>{audit.faviconUrl ?? "unknown"}</code>
          </p>
          <p className="mt-1 text-xs">
            Runtime loaded icon: <code>{runtimeFaviconHref || "not detected"}</code>
          </p>
          <p className="mt-1 text-xs">
            Hash: <code>{audit.faviconHash ?? "n/a"}</code>
          </p>
          <p className="mt-1 text-xs">
            Last-Modified: <code>{audit.lastModified ?? "n/a"}</code> · ETag:{" "}
            <code>{audit.etag ?? "n/a"}</code>
          </p>
          {audit.renderingFlags && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {Object.entries(audit.renderingFlags).map(([k, v]) => (
                <li key={k}>
                  {k}: <code>{String(v)}</code>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {audit.comparisons.map((c) => (
              <li key={c.size}>
                {c.size}px: {c.diffPct.toFixed(3)}% diff — {c.pass ? "ok" : "FAIL"}
              </li>
            ))}
          </ul>
          <ul className="mt-3 list-disc pl-5 text-xs">
            {audit.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
