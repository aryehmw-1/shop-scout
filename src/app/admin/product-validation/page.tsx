"use client";

import { useCallback, useEffect, useState } from "react";

interface Stats {
  total: number;
  raw: number;
  checked: number;
  matched: number;
  verified: number;
  published: number;
  needsReview: number;
  rejected: number;
  stale: number;
}

interface Record {
  id: string;
  retailer: string;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  price: number | null;
  size: string | null;
  upcGtin: string | null;
  processingStatus: string;
  validationStatus: string | null;
  confidenceScore: number | null;
  validationReasonsJson: string;
  duplicateGroupId: string | null;
  matchedProductId: string | null;
  scrapedAt: string;
}

const STATUSES = [
  "NEEDS_REVIEW",
  "PUBLISHED",
  "VERIFIED",
  "MATCHED",
  "CHECKED",
  "RAW",
  "STALE",
  "REJECTED",
];

export default function ProductValidationAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [status, setStatus] = useState("NEEDS_REVIEW");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/product-validation?status=${status}&limit=100`);
      const data = await res.json();
      setStats(data.stats);
      setRecords(data.records ?? []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (id: string, action: string) => {
      await fetch("/api/admin/product-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      load();
    },
    [load],
  );

  // Product-level actions (publish/unpublish/merge/split/reject/revalidate) on
  // the canonical Product a raw record is matched to. Calls /api/admin/products.
  const productAct = useCallback(
    async (productId: string, action: string) => {
      let targetProductId: string | undefined;
      if (action === "merge") {
        targetProductId =
          window.prompt("Merge INTO which surviving product id?")?.trim() || undefined;
        if (!targetProductId) return;
      }
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, action, targetProductId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        window.alert(`Action failed: ${err.error ?? res.status}`);
      }
      load();
    },
    [load],
  );

  const runBatch = useCallback(async () => {
    setLoading(true);
    await fetch("/api/admin/product-validation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run_batch" }),
    });
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Product Validation</h1>
        <button
          onClick={runBatch}
          disabled={loading}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          Run validation batch
        </button>
      </div>

      {stats && (
        <div className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {(
            [
              ["Total", stats.total],
              ["Raw", stats.raw],
              ["Checked", stats.checked],
              ["Matched", stats.matched],
              ["Verified", stats.verified],
              ["Published", stats.published],
              ["Review", stats.needsReview],
              ["Rejected", stats.rejected],
              ["Stale", stats.stale],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-center">
              <div className="text-xl font-bold text-stone-900">{n}</div>
              <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status === s ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-stone-400">Loading…</p>}

      <div className="space-y-3">
        {records.map((r) => {
          const reasons: string[] = safeParse(r.validationReasonsJson);
          return (
            <div key={r.id} className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4">
              {r.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded object-contain" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-400">
                  no image
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-900">{r.title ?? "(untitled)"}</span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                    {r.retailer}
                  </span>
                  <span className="text-xs font-bold text-orange-600">
                    {r.confidenceScore ?? "–"}%
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-stone-500">
                  {r.brand} · {r.size ?? "no size"} · {r.price != null ? `$${r.price}` : "no price"} ·{" "}
                  UPC {r.upcGtin ?? "—"}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {reasons.slice(0, 8).map((reason, i) => (
                    <span key={i} className="rounded bg-stone-50 px-1.5 py-0.5 text-[10px] text-stone-500">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button onClick={() => act(r.id, "approve")} className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  Approve
                </button>
                <button onClick={() => act(r.id, "mark_verified")} className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  Verify
                </button>
                <button onClick={() => act(r.id, "send_back")} className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
                  Revalidate
                </button>
                <button onClick={() => act(r.id, "reject")} className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                  Reject
                </button>
              </div>
              {r.matchedProductId && (
                <div className="flex shrink-0 flex-col gap-1 border-l border-stone-100 pl-3">
                  <span className="text-[9px] font-bold uppercase tracking-wide text-stone-400">
                    Canonical product
                  </span>
                  <button onClick={() => productAct(r.matchedProductId!, "publish")} className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                    Publish
                  </button>
                  <button onClick={() => productAct(r.matchedProductId!, "unpublish")} className="rounded bg-stone-600 px-3 py-1 text-xs font-semibold text-white">
                    Unpublish
                  </button>
                  <button onClick={() => productAct(r.matchedProductId!, "revalidate")} className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white">
                    Revalidate
                  </button>
                  <button onClick={() => productAct(r.matchedProductId!, "merge")} className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                    Merge…
                  </button>
                  <button onClick={() => productAct(r.matchedProductId!, "split")} className="rounded bg-purple-600 px-3 py-1 text-xs font-semibold text-white">
                    Split
                  </button>
                  <button onClick={() => productAct(r.matchedProductId!, "reject")} className="rounded bg-red-700 px-3 py-1 text-xs font-semibold text-white">
                    Reject product
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!loading && !records.length && <p className="text-sm text-stone-400">No records in {status}.</p>}
      </div>
    </div>
  );
}

function safeParse(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
