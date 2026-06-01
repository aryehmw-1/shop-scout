"use client";

import {
  BRAND_NAV_ICON_URL,
  brandAssetUrl,
} from "@/lib/brand/mark-config";
import { useEffect, useState } from "react";

export type BrandHomeMarkSize = "xs" | "sm" | "md" | "lg";

const FORCE_PARITY_STORAGE_KEY = "brand.force.parity";

/** Navbar/tab parity baseline: same source PNG, no visual modifiers. */
const SPECS: Record<
  BrandHomeMarkSize,
  { src: string; px: number; label: string }
> = {
  xs: { src: brandAssetUrl(BRAND_NAV_ICON_URL), px: 32, label: "32px tab parity" },
  sm: { src: brandAssetUrl(BRAND_NAV_ICON_URL), px: 32, label: "32px tab parity" },
  md: { src: brandAssetUrl(BRAND_NAV_ICON_URL), px: 32, label: "32px tab parity" },
  lg: { src: brandAssetUrl(BRAND_NAV_ICON_URL), px: 32, label: "32px tab parity" },
};

interface BrandHomeMarkProps {
  size?: BrandHomeMarkSize;
  className?: string;
  pulse?: boolean;
}

/**
 * Navbar brand mark — renders the same 32×32 PNG bytes as the browser tab favicon.
 * No CSS rounding, shadows, or filters: optical identity matches mark-32.png exactly.
 */
export function BrandHomeMark({
  size = "md",
  className = "",
  pulse = false,
}: BrandHomeMarkProps) {
  const [forcedParity, setForcedParity] = useState(true);

  useEffect(() => {
    const read = () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get("brandParity");
      if (fromQuery === "1") {
        localStorage.setItem(FORCE_PARITY_STORAGE_KEY, "1");
        setForcedParity(true);
        return;
      }
      if (fromQuery === "0") {
        localStorage.setItem(FORCE_PARITY_STORAGE_KEY, "0");
        setForcedParity(false);
        return;
      }
      const stored = localStorage.getItem(FORCE_PARITY_STORAGE_KEY);
      setForcedParity(stored !== "0");
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("brand:parity-mode", read as EventListener);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("brand:parity-mode", read as EventListener);
    };
  }, []);

  const base = SPECS[size];
  const spec =
    forcedParity ?
      { src: brandAssetUrl(BRAND_NAV_ICON_URL), px: 32, label: "forced parity: mark-32.png" }
    : base;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spec.src}
      alt=""
      width={spec.px}
      height={spec.px}
      aria-hidden
      data-brand-mark-size={size}
      data-brand-mark-parity={spec.label}
      className={`block shrink-0 ${pulse ? "animate-pulse" : ""} ${className}`}
      style={{
        width: spec.px,
        height: spec.px,
        imageRendering: spec.px <= 32 ? "crisp-edges" : "auto",
      }}
    />
  );
}
