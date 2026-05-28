import Link from "next/link";
import { Home } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

interface LogoProps {
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Logo({ showTagline = false, size = "md" }: LogoProps) {
  const iconSize = size === "lg" ? 32 : size === "sm" ? 20 : 26;
  const textSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";

  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-rose-500 text-white shadow-lg shadow-orange-500/30 transition group-hover:shadow-xl group-hover:shadow-orange-500/35">
        <Home size={iconSize - 6} strokeWidth={2.5} />
      </span>
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
