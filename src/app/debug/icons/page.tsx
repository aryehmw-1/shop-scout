import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import Link from "next/link";
import { BrandVisualCompare } from "@/components/debug/BrandVisualCompare";

const ROOT = process.cwd();

function fileInfo(label: string, rel: string) {
  const abs = join(ROOT, "public", rel.replace(/^\//, ""));
  if (!existsSync(abs)) {
    return { label, path: rel, exists: false as const };
  }
  const buf = readFileSync(abs);
  return {
    label,
    path: rel,
    exists: true as const,
    bytes: buf.length,
    md5: createHash("md5").update(buf).digest("hex"),
  };
}

export default function IconDebugPage() {
  const assets = [
    fileInfo("Canonical SVG (source)", "/brand/mark.svg"),
    fileInfo("Tab / navbar PNG (32)", "/brand/mark-32.png"),
    fileInfo("Tab ICO", "/brand/mark.ico"),
    fileInfo("Apple touch (180)", "/brand/mark-180.png"),
    fileInfo("OG / social (512)", "/brand/og-mark.png"),
  ];

  const mark32 = fileInfo("Tab / navbar PNG (32)", "/brand/mark-32.png");

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <div>
        <div className="flex items-center gap-3">
          <Link href="/debug/grocery" className="text-sm text-stone-500 hover:text-stone-800">
            Grocery trace →
          </Link>
          <Link href="/debug/control-center" className="text-sm text-sage-700 hover:text-sage-900">
            Operational control center →
          </Link>
        </div>
        <h1 className="font-homy mt-2 text-2xl font-bold text-ink-900">Brand mark visual audit</h1>
        <p className="mt-2 text-sm text-ink-600">
          Navbar and tab icon must be <strong>pixel-identical</strong> at 32×32. All rasters derive
          from <code className="text-xs">public/brand/mark.svg</code>. No CSS rounding or shadows on
          the mark.
        </p>
      </div>

      <BrandVisualCompare />

      <section className="rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="font-semibold text-ink-900">Asset inventory</h2>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b text-ink-500">
              <th className="py-1">Asset</th>
              <th className="py-1">MD5</th>
              <th className="py-1">Bytes</th>
            </tr>
          </thead>
          <tbody>
            {assets
              .filter((a) => a.exists)
              .map((a) => (
                <tr key={a.path} className="border-b border-ink-100 font-mono">
                  <td className="py-2 pr-2 text-ink-800">{a.label}</td>
                  <td className="py-2 pr-2 text-ink-500">{a.md5.slice(0, 16)}…</td>
                  <td className="py-2 text-ink-500">{a.bytes}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {mark32.exists && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
          <p className="font-semibold">Safari / cache checklist</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>Safari caches favicons per-origin — test private window after deploy</li>
            <li>
              <code>localhost:3000</code> and <code>127.0.0.1:3000</code> have separate caches
            </li>
            <li>Icon URLs include <code>?v=</code> cache-bust from SVG md5</li>
            <li>Run: npm run audit:brand && npm run audit:brand:visual</li>
          </ul>
        </section>
      )}
    </main>
  );
}
