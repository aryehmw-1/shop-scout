import { Home } from "lucide-react";

export type BrandHomeMarkSize = "xs" | "sm" | "md" | "lg";

const BOX: Record<BrandHomeMarkSize, string> = {
  xs: "h-9 w-9 rounded-xl",
  sm: "h-8 w-8 rounded-xl",
  md: "h-10 w-10 rounded-xl",
  lg: "h-11 w-11 rounded-xl",
};

const ICON: Record<BrandHomeMarkSize, number> = {
  xs: 16,
  sm: 14,
  md: 20,
  lg: 26,
};

interface BrandHomeMarkProps {
  size?: BrandHomeMarkSize;
  className?: string;
  /** Loading / thinking state */
  pulse?: boolean;
}

/**
 * Shared Shop Scout home mark — same gradient + house icon as sidebar Logo.
 * Use for chat avatar, loading states, and anywhere the brand icon appears without wordmark.
 */
export function BrandHomeMark({
  size = "md",
  className = "",
  pulse = false,
}: BrandHomeMarkProps) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-orange-500 via-amber-500 to-rose-500 text-white shadow-lg shadow-orange-500/30 ${BOX[size]} ${pulse ? "animate-pulse" : ""} ${className}`}
      aria-hidden
    >
      <Home size={ICON[size]} strokeWidth={2.5} className="drop-shadow-sm" />
    </span>
  );
}
