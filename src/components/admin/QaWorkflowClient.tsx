"use client";

import { useCallback, useEffect, useState } from "react";
import type { QaCandidate } from "@/lib/inventory/inventory-qa";
import { ProductImage } from "@/components/ProductImage";
import { ExternalLink, Check, X, AlertTriangle } from "lucide-react";

interface QaWorkflowClientProps {
  initialCandidates: QaCandidate[];
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    misleadingQuantity: number;
  };
}

const TAGS = [
  { id: "suspicious_quantity", label: "Suspicious quantity" },
  { id: "wrong_product_identity", label: "Wrong product identity" },
  { id: "bulk_mismatch", label: "Bulk mismatch" },
] as const;

export function QaWorkflowClient({ initialCandidates, summary }: QaWorkflowClientProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [index, setIndex] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState(summary);

  const current = candidates[index];

  useEffect(() => {
    if (!current) return;
    setSelectedTags(current.reviewTags ?? []);
    setNotes(current.reviewNotes ?? "");
  }, [current]);

  const submit = useCallback(
    async (status: "approved" | "rejected") => {
      if (!current) return;
      setSaving(true);
      try {
        const res = await fetch("/api/admin/inventory-qa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceQuoteId: current.priceQuoteId,
            catalogId: current.catalogId,
            status,
            tags: selectedTags,
            notes: notes.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error("save failed");

        setCandidates((prev) =>
          prev.map((c) =>
            c.priceQuoteId === current.priceQuoteId ?
              {
                ...c,
                reviewStatus: status,
                reviewTags: selectedTags as QaCandidate["reviewTags"],
                reviewNotes: notes,
                reviewedAt: new Date().toISOString(),
              }
            : c,
          ),
        );
        setStats((s) => ({
          ...s,
          pending: Math.max(0, s.pending - (current.reviewStatus === "pending" ? 1 : 0)),
          approved: s.approved + (status === "approved" ? 1 : 0) - (current.reviewStatus === "approved" ? 1 : 0),
          rejected: s.rejected + (status === "rejected" ? 1 : 0) - (current.reviewStatus === "rejected" ? 1 : 0),
        }));
        if (index < candidates.length - 1) setIndex((i) => i + 1);
      } finally {
        setSaving(false);
      }
    },
    [current, index, candidates.length, notes, selectedTags],
  );

  if (!current) {
    return (
      <p className="rounded-xl border border-sage-200 bg-sage-50 p-6 text-center text-stone-600">
        No QA candidates loaded.
      </p>
    );
  }

  const q = current.quantity;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="Pending" value={stats.pending} warn={stats.pending > 0} />
        <Stat label="Approved" value={stats.approved} />
        <Stat label="Rejected" value={stats.rejected} />
        <Stat label="Quantity warnings" value={stats.misleadingQuantity} warn={stats.misleadingQuantity > 0} />
      </div>

      <div className="flex items-center justify-between text-sm text-stone-600">
        <span>
          Product {index + 1} of {candidates.length} ·{" "}
          <span className="font-medium capitalize">{current.reviewStatus}</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={index >= candidates.length - 1}
            onClick={() => setIndex((i) => i + 1)}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[240px_1fr]">
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-xl border bg-stone-50">
              <ProductImage
                src={current.imageUrl ?? current.catalogImageUrl ?? ""}
                alt={current.canonicalTitle}
                className="h-full w-full object-contain"
              />
            </div>
            <p className="text-xs text-stone-500">Catalog image · retailer image shown when available</p>
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {current.catalogId} · {current.category}
              </p>
              <h2 className="text-xl font-bold text-stone-900">{current.canonicalTitle}</h2>
              <p className="text-sm text-stone-600">{current.canonicalBrand}</p>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Retailer title" value={current.storeTitle ?? "—"} />
              <Field label="Normalized price" value={`$${current.priceUsd.toFixed(2)}`} />
              <Field label="Unit price (DB)" value={`$${current.unitPriceUsd.toFixed(2)}`} />
              <Field label="Catalog baseline" value={`$${current.catalogBasePrice.toFixed(2)}`} />
              <Field label="Price ratio" value={String(q.priceRatioVsCatalog)} />
              <Field label="Match confidence" value={current.matchConfidence.toFixed(2)} />
              <Field label="Catalog size" value={current.catalogSize} />
              <Field label="Title pack parsed" value={String(q.titlePackExtracted)} />
              <Field label="Catalog pack assumption" value={String(q.catalogPackAssumption)} />
              <Field label="Consumer quantity label" value={q.consumerQuantityLabel} />
              <Field
                label="Normalization"
                value={
                  q.normalization ?
                    `${q.normalization.method} · ${q.normalization.reason}`
                  : "n/a"
                }
              />
              <Field label="ASIN" value={current.asin ?? "—"} />
            </dl>

            {q.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <ul className="list-disc pl-4">
                    {q.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <a
              href={current.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-sage-700 hover:underline"
            >
              Open live PDP
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="border-t border-stone-100 bg-stone-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-stone-500">Issue tags</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {TAGS.map((tag) => {
              const on = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      on ? prev.filter((t) => t !== tag.id) : [...prev, tag.id],
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    on ?
                      "bg-amber-200 text-amber-900"
                    : "bg-white border border-stone-200 text-stone-600"
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional reviewer notes…"
            className="mb-4 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => submit("approved")}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={16} /> Approve
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit("rejected")}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <X size={16} /> Reject
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${warn ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}
    >
      <p className="text-xs uppercase text-stone-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
