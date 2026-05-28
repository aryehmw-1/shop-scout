import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { CheckCircle2, Circle } from "lucide-react";

const affiliateSteps = [
  "Apply for Amazon Associates",
  "Apply for Walmart / Target via Impact.com",
  "Copy .env.example → .env.local",
  "Add AFFILIATE_* tags from each program",
  "Restart npm run dev and test a View deal link",
];

const dataSteps = [
  "Choose first API (Instacart, Impact, or Amazon PA-API)",
  "Build connector in src/lib/retailers/connectors/",
  "Return ProductSearchResults (local + online rows)",
  "Add price cache + “as of” timestamp on UI",
];

export default function LaunchPage() {
  return (
    <AppShell>
      <div className="flex-1 px-6 py-10 lg:px-12">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold text-stone-900">Launch guide</h1>
          <p className="mt-2 text-stone-600">
            Shop Scout is demo-ready. Complete these two gaps to go live and
            earn affiliate revenue.
          </p>

          <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-stone-900">
              <Circle className="text-amber-500" size={20} />
              Gap 1: Live price data
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Demo prices are simulated. Connect a real grocery API so checkout
              prices match what users see.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-stone-700">
              {dataSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>

          <section className="mt-6 rounded-2xl border border-sage-200 bg-sage-50/50 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-stone-900">
              <Circle className="text-sage-600" size={20} />
              Gap 2: Affiliate IDs
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Every &quot;View deal&quot; button is wired for affiliate tags via{" "}
              <code className="rounded bg-white px-1">.env.local</code>.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-stone-700">
              {affiliateSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>

          <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="font-semibold text-stone-900">Demo practice</h2>
            <p className="mt-2 text-sm text-stone-600">
              Full walkthrough: see <strong>DEMO.md</strong> in the project folder.
            </p>
            <Link
              href="/chat"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sage-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sage-700"
            >
              Open demo chat
            </Link>
          </section>

          <div className="mt-8 flex items-start gap-2 text-sm text-stone-500">
            <CheckCircle2 className="shrink-0 text-sage-600" size={18} />
            <p>
              Full details in <strong>LAUNCH.md</strong> and{" "}
              <strong>DEMO.md</strong> in your project folder. Copy{" "}
              <code className="rounded bg-stone-100 px-1">.env.example</code> for
              affiliate tags.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </AppShell>
  );
}
