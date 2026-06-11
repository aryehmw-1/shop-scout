"use client";

import { useState } from "react";

interface TestResult {
  ok: boolean;
  configured: boolean;
  status?: number;
  detail: string;
}

export default function BrightDataAdminPage() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bright-data/test");
      setResult((await res.json()) as TestResult);
    } catch (err) {
      setResult({
        ok: false,
        configured: false,
        detail: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-bold text-stone-900">Bright Data — connection test</h1>
      <p className="mt-2 text-sm text-stone-600">
        Verifies that <code className="rounded bg-stone-100 px-1">BRIGHT_DATA_API_KEY</code> is set
        and can authenticate. The key itself is never shown. See{" "}
        <code className="rounded bg-stone-100 px-1">docs/BRIGHT_DATA_SETUP.md</code> for where to
        place the key.
      </p>

      <button
        type="button"
        onClick={runTest}
        disabled={loading}
        className="mt-6 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
      >
        {loading ? "Testing…" : "Test connection"}
      </button>

      {result && (
        <div
          className={`mt-6 rounded-xl border p-4 text-sm ${
            result.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-bold">
            {result.ok ? "✓ Connected" : result.configured ? "✗ Authentication failed" : "✗ Not configured"}
          </p>
          {result.status != null && <p className="mt-1">HTTP status: {result.status}</p>}
          <p className="mt-1 break-words">{result.detail}</p>
        </div>
      )}
    </div>
  );
}
