"use client";

import { useEffect, useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/catalog-images";
import { proxiedImageUrl } from "@/lib/image-display";
import { retailerLogoFallbackUrl } from "@/lib/offers/offer-image-fallback";
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
  if (src.includes("placehold.co") && retailerId) {
    return src;
  }
  return proxiedImageUrl(src);
}

export function ProductImage({
  src,
  alt,
  className = "",
  retailerId,
}: ProductImageProps) {
  const [url, setUrl] = useState(() => resolveImageSrc(src, retailerId));
  const [step, setStep] = useState(0);

  useEffect(() => {
    setUrl(resolveImageSrc(src, retailerId));
    setStep(0);
  }, [src, retailerId]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (step === 0 && retailerId) {
          setStep(1);
          setUrl(retailerLogoFallbackUrl(retailerId));
          return;
        }
        if (url !== IMAGE_FALLBACK) {
          setUrl(IMAGE_FALLBACK);
        }
      }}
    />
  );
}
