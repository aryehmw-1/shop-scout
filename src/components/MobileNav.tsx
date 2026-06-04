"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Package, Search, Settings } from "lucide-react";

const nav = [
  { href: "/chat", label: "Compare", icon: Search },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200 bg-white/95 px-2 py-2 backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-4 gap-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/chat"
              ? pathname.startsWith("/compare") || pathname.startsWith("/chat")
              : pathname.startsWith(href);

          return (
            <li key={href}>
              <Link
                href={href}
                scroll={false}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-bold transition ${
                  active
                    ? "bg-stone-950 text-white"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                }`}
              >
                <Icon size={19} strokeWidth={2} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
