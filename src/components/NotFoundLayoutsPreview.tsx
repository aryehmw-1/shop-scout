"use client";

// PREVIEW-ONLY (/not-found-layouts): 5 DESKTOP layouts for the "we couldn't find
// it" screen. Mobile stays as-is. Sample query: "Beats Studio headphones".

import { BellPlus, Search, ArrowRight, Package, Mail, Clock } from "lucide-react";

const Q = "Beats Studio headphones";
const CHIPS = ["Headphones", "Air fryers", "Paper towels", "Coffee makers", "Lamps", "Dish soap"];

function Email({ wide }: { wide?: boolean }) {
  return (
    <div className={`flex ${wide ? "flex-row" : "flex-col"} gap-2`}>
      <input placeholder="you@email.com" className="flex-1 rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-orange-300" />
      <button className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-bold text-white">
        <BellPlus size={16} /> Notify me when it&apos;s in
      </button>
    </div>
  );
}
function Frame({ id, name, blurb, children }: { id: string; name: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg font-bold text-stone-900">{id} · {name}</h2>
      <p className="mb-3 text-sm text-stone-500">{blurb}</p>
      <div className="rounded-2xl border border-stone-200 bg-cream-50 p-6 shadow-sm">{children}</div>
    </section>
  );
}

// N1 — split: request (left) + browse popular (right)
function N1() {
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="rounded-2xl border border-orange-200 bg-white p-6">
        <BellPlus className="text-orange-500" size={28} />
        <h3 className="mt-3 text-xl font-bold text-stone-900">We&apos;ll hunt down <span className="text-orange-600">{Q}</span></h3>
        <p className="mt-1 text-sm text-stone-500">Drop your email and we&apos;ll ping you the moment it&apos;s live.</p>
        <div className="mt-4"><Email /></div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">While you wait — browse what we have</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((c) => <span key={c} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-700">{c}</span>)}
        </div>
        <a className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-orange-600">Browse full inventory <ArrowRight size={14} /></a>
      </div>
    </div>
  );
}

// N2 — centered card, inline email
function N2() {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50"><BellPlus className="text-orange-500" size={26} /></div>
      <h3 className="mt-4 text-2xl font-bold text-stone-900">We don&apos;t carry <span className="text-orange-600">{Q}</span> yet</h3>
      <p className="mt-1 text-stone-500">We&apos;re always expanding. Get notified the moment it&apos;s added.</p>
      <div className="mx-auto mt-5 max-w-lg"><Email wide /></div>
      <a className="mt-4 inline-block text-sm font-semibold text-orange-600">Browse available products →</a>
    </div>
  );
}

// N3 — request + "closest alternatives" grid
function N3() {
  return (
    <div>
      <div className="rounded-2xl border border-orange-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-stone-900">No exact match for <span className="text-orange-600">{Q}</span></h3>
            <p className="text-sm text-stone-500">Request it and we&apos;ll add it — or check the closest options below.</p>
          </div>
          <div className="w-[26rem] shrink-0"><Email wide /></div>
        </div>
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold text-stone-700">Closest options we do carry</p>
      <div className="grid grid-cols-4 gap-3">
        {["JBL Tune 510BT", "Sony WH-CH520", "Anker Soundcore Q20", "Beats Solo Buds"].map((t) => (
          <div key={t} className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="mb-2 h-20 rounded-lg bg-stone-100" />
            <p className="line-clamp-1 text-[13px] font-semibold text-stone-900">{t}</p>
            <p className="text-sm font-bold text-sage-800">$49.99</p>
            <button className="mt-2 w-full rounded-lg bg-stone-900 py-1.5 text-xs font-bold text-white">View</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// N4 — hero banner, chips
function N4() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-10 text-center">
      <Search className="mx-auto text-orange-400" size={32} />
      <h3 className="mt-3 text-3xl font-extrabold text-stone-900">Can&apos;t find <span className="text-orange-600">{Q}</span>?</h3>
      <p className="mt-2 text-stone-600">We&apos;ll add it and email you when it&apos;s live. Or explore popular picks:</p>
      <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
        {CHIPS.map((c) => <span key={c} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm">{c}</span>)}
      </div>
      <div className="mx-auto mt-6 max-w-md"><Email wide /></div>
    </div>
  );
}

// N5 — two-column: form + trust/how-it-works
function N5() {
  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-3 rounded-2xl border border-stone-200 bg-white p-6">
        <h3 className="text-xl font-bold text-stone-900">Request <span className="text-orange-600">{Q}</span></h3>
        <p className="mt-1 text-sm text-stone-500">Add the brand, size, or model so we add the right one.</p>
        <div className="mt-4 space-y-2">
          <input defaultValue={Q} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-orange-300" />
          <Email wide />
        </div>
        <a className="mt-3 inline-block text-sm font-semibold text-orange-600">Browse available products →</a>
      </div>
      <div className="col-span-2 rounded-2xl border border-stone-200 bg-white p-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">What happens next</h3>
        <ul className="space-y-3 text-sm text-stone-600">
          <li className="flex gap-2"><Package size={16} className="mt-0.5 shrink-0 text-orange-500" /> We source it from Amazon, Walmart, Target &amp; more.</li>
          <li className="flex gap-2"><Mail size={16} className="mt-0.5 shrink-0 text-orange-500" /> You get one email when it&apos;s live — no spam.</li>
          <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-orange-500" /> Usually added within a few days.</li>
        </ul>
      </div>
    </div>
  );
}

export function NotFoundLayoutsPreview() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="font-homy text-2xl font-bold text-ink-900">Desktop &quot;not found&quot; layouts — preview</h1>
      <p className="mb-8 text-sm text-stone-500">5 desktop options for the &quot;we couldn&apos;t find it&quot; screen (mobile stays as-is). Sample: <strong>{Q}</strong>. Pick one and I&apos;ll apply it.</p>
      <Frame id="N1" name="Split — request + browse" blurb="Left: notify-me request. Right: browse what we have. Uses full width, keeps users moving.">{<N1 />}</Frame>
      <Frame id="N2" name="Centered card" blurb="Clean, focused single card with inline email. Simple and professional.">{<N2 />}</Frame>
      <Frame id="N3" name="Request + closest alternatives" blurb="Compact request bar + a grid of the closest products we DO carry (best for conversion).">{<N3 />}</Frame>
      <Frame id="N4" name="Hero banner + chips" blurb="Big friendly banner with popular-category chips and email capture.">{<N4 />}</Frame>
      <Frame id="N5" name="Form + 'what happens next'" blurb="Request form beside a trust panel explaining the notify flow.">{<N5 />}</Frame>
    </div>
  );
}
