"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Scale, Heart, Settings } from "lucide-react";
import { COMPARE_NAV_LABEL } from "@/lib/constants";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "Compare", icon: Scale },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/settings", label: "You", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-orange-100/90 bg-cream-50/95 px-2 py-2 backdrop-blur-xl md:hidden">
      <div className="flex justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={href === "/chat" ? COMPARE_NAV_LABEL : label}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-xs transition ${
                active ? "font-semibold text-sage-700" : "text-ink-500"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
