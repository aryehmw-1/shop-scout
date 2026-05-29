"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Heart, Settings } from "lucide-react";
import { ShopScoutCompareIcon } from "@/components/brand/ShopScoutCompareIcon";

const nav = [
  { href: "/", label: "Home", icon: Home, compare: false },
  { href: "/chat", label: "Compare", icon: null, compare: true },
  { href: "/saved", label: "Saved", icon: Heart, compare: false },
  { href: "/settings", label: "Settings", icon: Settings, compare: false },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-orange-100/90 bg-cream-50/95 px-2 py-2 backdrop-blur-xl md:hidden">
      <ul className="flex justify-around">
        {nav.map(({ href, label, icon: Icon, compare }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition ${
                  active
                    ? "text-sage-700"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {compare ? (
                  <ShopScoutCompareIcon size={20} strokeWidth={2.2} />
                ) : (
                  Icon && <Icon size={20} strokeWidth={2} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
