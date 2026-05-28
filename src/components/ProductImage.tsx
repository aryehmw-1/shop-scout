"use client";

import { useEffect, useState } from "react";
import { IMAGE_FALLBACK } from "@/lib/catalog-images";
import { proxiedImageUrl } from "@/lib/image-display";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
}

function resolveImageSrc(src: string | undefined): string {
  if (!src?.startsWith("https://")) return IMAGE_FALLBACK;
  return proxiedImageUrl(src);
}

export function ProductImage({ src, alt, className = "" }: ProductImageProps) {
  const [url, setUrl] = useState(() => resolveImageSrc(src));

  useEffect(() => {
    setUrl(resolveImageSrc(src));
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (url !== IMAGE_FALLBACK) setUrl(IMAGE_FALLBACK);
      }}
    />
  );
}
