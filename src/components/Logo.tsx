import Link from "next/link";
import { BrandHomeMark } from "@/components/brand/BrandHomeMark";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

interface LogoProps {
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Logo({ showTagline = false, size = "md" }: LogoProps) {
  const markSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";
  const textSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";

  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <BrandHomeMark
        size={markSize}
        className="transition group-hover:shadow-xl group-hover:shadow-orange-500/35"
      />
      <div>
        <p
          className={`font-display font-bold tracking-tight text-ink-900 ${textSize}`}
        >
          {APP_NAME}
        </p>
        {showTagline && (
          <p className="text-xs text-ink-500">{APP_TAGLINE}</p>
        )}
      </div>
    </Link>
  );
}
