"use client";

import { useMemo, useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/catalog-images";
import { proxiedImageUrl } from "@/lib/image-display";
import { retailerLogoFallbackUrl } from "@/lib/offers/offer-image-fallback";
import { isRecycledSeedImage } from "@/lib/images/recycled-seed-images";
import type { RetailerId } from "@/lib/types";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  retailerId?: RetailerId;
}

function resolveImageSrc(src: string | undefined, retailerId?: RetailerId): string {
  if (!src?.startsWith("https://")) {
    return retailerId ? retailerLogoFallbackUrl(retailerId) : IMAGE_FALLBACK;
  }
  // Defense-in-depth: never render a recycled seed placeholder (one image reused
  // across many unrelated products) as a product photo — show a neutral fallback.
  if (isRecycledSeedImage(src)) {
    return retailerId ? retailerLogoFallbackUrl(retailerId) : IMAGE_FALLBACK;
  }
  if (src.includes("placehold.co") && retailerId) {
    return src;
  }
  return proxiedImageUrl(src);
}

function localPlaceholder(src: string | undefined): {
  bg: string;
  fg: string;
  label: string;
} | null {
  if (!src?.includes("placehold.co")) return null;
  try {
    const url = new URL(src);
    const parts = url.pathname.split("/").filter(Boolean);
    const bg = parts[1] ?? "d6d3d1";
    const fg = parts[2] ?? "44403c";
    const label = url.searchParams.get("text") ?? "Product";
    return { bg, fg, label };
  } catch {
    return { bg: "d6d3d1", fg: "44403c", label: "Product" };
  }
}

export function ProductImage({
  src,
  alt,
  className = "",
  retailerId,
}: ProductImageProps) {
  const placeholder = localPlaceholder(src);
  const baseUrl = useMemo(() => resolveImageSrc(src, retailerId), [src, retailerId]);
  const [fallback, setFallback] = useState<{ baseUrl: string; url: string } | null>(null);
  const url = fallback?.baseUrl === baseUrl ? fallback.url : baseUrl;

  if (placeholder) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center text-center text-sm font-bold leading-tight ${className}`}
        style={{
          backgroundColor: `#${placeholder.bg}`,
          color: `#${placeholder.fg}`,
        }}
      >
        <span className="max-w-full px-2">{placeholder.label}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (retailerId && url !== retailerLogoFallbackUrl(retailerId)) {
          setFallback({ baseUrl, url: retailerLogoFallbackUrl(retailerId) });
          return;
        }
        if (url !== IMAGE_FALLBACK) {
          setFallback({ baseUrl, url: IMAGE_FALLBACK });
        }
      }}
    />
  );
}
