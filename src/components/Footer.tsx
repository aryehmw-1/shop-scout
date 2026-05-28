import Link from "next/link";
import { APP_NAME, COMPARE_NAV_LABEL } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-orange-100/80 bg-cream-50/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display font-semibold text-ink-800">{APP_NAME}</p>
          <p className="mt-1 max-w-sm text-sm text-ink-500">
            Compare prices on groceries, fashion, home, sports, and more. We may earn
            a commission when you shop through our links.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
          <Link href="/about" className="hover:text-sage-700">
            About
          </Link>
          <Link href="/chat" className="hover:text-sage-700">
            {COMPARE_NAV_LABEL}
          </Link>
          <Link href="/contact" className="hover:text-sage-700">
            Contact
          </Link>
          <Link href="/affiliate-disclosure" className="hover:text-sage-700">
            Affiliate disclosure
          </Link>
          <Link href="/privacy" className="hover:text-sage-700">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-sage-700">
            Terms
          </Link>
        </nav>
      </div>
      <div className="border-t border-ink-100 py-4 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} {APP_NAME}. Prices are estimates — confirm at
        checkout.
      </div>
    </footer>
  );
}
