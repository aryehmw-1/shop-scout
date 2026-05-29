import Link from "next/link";
import { loadQaCandidates } from "@/lib/inventory/inventory-qa";
import { QaWorkflowClient } from "@/components/admin/QaWorkflowClient";

export const dynamic = "force-dynamic";

export default async function InventoryQaPage() {
  const { candidates, summary } = await loadQaCandidates({ flagshipOnly: true });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Inventory QA workflow</h1>
          <p className="text-sm text-stone-500">
            Human-in-the-loop verification before scaling retailers or proxies
          </p>
        </div>
        <Link href="/admin/inventory" className="text-sm text-sage-700 hover:underline">
          ← Inventory dashboard
        </Link>
      </div>

      <QaWorkflowClient initialCandidates={candidates} summary={summary} />
    </main>
  );
}
