"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

interface DebugRow {
  retailer: string;
  urlKind: string;
  productUrl: string;
  imageUrl: string;
  imageSource?: string;
  price: number;
  priceSource?: string;
  priceConfidence?: number;
  matchConfidence?: number;
  identityConfidence?: number;
  trustTier: string;
  verified: boolean;
  rankScore: number;
  rankPenalties: string[];
  confidenceReasons: Array<{ code: string; message: string; weight: number }>;
  priceNote?: string;
}

interface DebugResponse {
  catalogId: string;
  title: string;
  offerCount: number;
  verifiedCount: number;
  offers: DebugRow[];
  error?: string;
}

export default function AdminOffersPage() {
  const [catalogId, setCatalogId] = useState("jeans-slim");
  const [query, setQuery] = useState("");
  const [zip, setZip] = useState("78701");
  const [data, setData] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (catalogId.trim()) params.set("catalogId", catalogId.trim());
      if (query.trim()) params.set("q", query.trim());
      params.set("zip", zip.trim());
      const res = await fetch(`/api/admin/offer-debug?${params}`);
      const json = (await res.json()) as DebugResponse;
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setData(json);
    } catch (e) {
      setData({
        catalogId: "",
        title: "",
        offerCount: 0,
        verifiedCount: 0,
        offers: [],
        error: e instanceof Error ? e.message : "Failed to load",
      });
    } finally {
      setLoading(false);
    }
  }, [catalogId, query, zip]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Offer quality debug</h1>
          <p className="mt-1 text-sm text-stone-600">
            Inspect urlKind, confidence, price source, image source, and penalties.
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-sage-700 hover:underline">
          ← Back to Shop Scout
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
          Catalog ID
          <input
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
            placeholder="jeans-slim"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
          Search query (optional)
          <input
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Levi jeans"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
          ZIP
          <input
            className="w-24 rounded-lg border border-stone-200 px-3 py-2 text-sm"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="self-end rounded-xl bg-sage-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sage-700 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Run debug"}
        </button>
      </div>

      {data?.error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {data.error}
        </p>
      )}

      {data && !data.error && (
        <>
          <p className="mb-4 text-sm text-stone-700">
            <strong>{data.title}</strong> ({data.catalogId}) · {data.offerCount}{" "}
            offers · {data.verifiedCount} verified
          </p>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                <tr>
                  <th className="px-3 py-2">Retailer</th>
                  <th className="px-3 py-2">Trust</th>
                  <th className="px-3 py-2">urlKind</th>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Match</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">Penalties / reasons</th>
                </tr>
              </thead>
              <tbody>
                {data.offers.map((row, i) => (
                  <tr
                    key={`${row.retailer}-${i}`}
                    className={`border-b border-stone-100 ${
                      row.verified ? "bg-sage-50/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{row.retailer}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.verified
                            ? "bg-sage-100 text-sage-800"
                            : "bg-stone-200 text-stone-700"
                        }`}
                      >
                        {row.trustTier}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.urlKind}</td>
                    <td className="px-3 py-2">{row.rankScore}</td>
                    <td className="px-3 py-2">
                      {(row.matchConfidence ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">${row.price.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.priceSource ?? "—"}</td>
                    <td className="px-3 py-2">{row.imageSource ?? "—"}</td>
                    <td className="max-w-md px-3 py-2 text-[10px] text-stone-600">
                      {row.rankPenalties.join(", ") || "—"}
                      {row.confidenceReasons?.length > 0 && (
                        <span className="mt-1 block">
                          {row.confidenceReasons
                            .map((r) => r.code)
                            .slice(0, 6)
                            .join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-stone-500">
            PDP URLs: {data.offers.filter((o) => o.urlKind === "pdp").length} ·
            Search URLs: {data.offers.filter((o) => o.urlKind === "search").length}
          </p>
        </>
      )}
    </main>
  );
}
