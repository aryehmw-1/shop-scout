import Link from "next/link";
import { ExperimentViewer } from "@/components/debug/ExperimentViewer";

export default async function ExperimentsDebugPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <Link href="/debug/control-center" className="text-sm text-stone-500 hover:text-stone-800">
          ← Control center
        </Link>
        <h1 className="font-homy mt-2 text-3xl font-bold text-stone-900">Detection factor experiments</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Structured challenge analytics, fingerprint diffs, session timelines, and acquisition strategy
          registry. Run batches via{" "}
          <code className="rounded bg-stone-100 px-1">npm run audit:experiment-matrix</code>.
        </p>
      </div>
      <ExperimentViewer initialBatchId={params.batch} />
    </main>
  );
}
