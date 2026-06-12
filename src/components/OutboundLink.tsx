"use client";

import type { ProductOffer } from "@/lib/types";
import { buildOutboundUrl, type OutboundClickContext } from "@/lib/affiliate/outbound";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

interface OutboundLinkProps {
  offer: ProductOffer;
  context?: OutboundClickContext;
  className?: string;
  children?: ReactNode;
  onNavigate?: (offer: ProductOffer) => void;
  "aria-label"?: string;
}

export function OutboundLink({
  offer,
  context,
  className,
  children,
  onNavigate,
  "aria-label": ariaLabel,
}: OutboundLinkProps) {
  const href = buildOutboundUrl(offer, context);

  // Affiliate-required retailers (Amazon/eBay) with no attachable tracking:
  // hide the outbound link entirely rather than send an un-monetized click.
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      aria-label={ariaLabel ?? `Shop at ${offer.retailerName}`}
      onClick={() => onNavigate?.(offer)}
    >
      {children ?? (
        <>
          Shop
          <ExternalLink size={14} aria-hidden />
        </>
      )}
    </a>
  );
}
