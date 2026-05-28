import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <article className="mx-auto max-w-2xl flex-1 px-6 py-12 lg:px-12">
        <p className="text-sm text-ink-500">
          <Link href="/" className="hover:text-orange-700">
            {APP_NAME}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink-700">{title}</span>
        </p>
        <h1 className="mt-4 font-homy text-3xl font-bold text-ink-900">{title}</h1>
        <div className="mt-8 space-y-6 text-ink-600 leading-relaxed">{children}</div>
      </article>
      <Footer />
    </AppShell>
  );
}
