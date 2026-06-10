"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

const SPECIFIC_EXAMPLES = [
  "Quaker Oats Old Fashioned 18oz canister",
  "Sony WH-1000XM5 noise cancelling headphones",
  "Tide Pods Laundry Detergent 42-count",
  "iPhone 17 Pro 256GB – any color",
  "Ninja AF101 Air Fryer 4-quart",
  "Kirkland Signature Olive Oil 2L",
];

const TYPE_SPEED = 42;
const DELETE_SPEED = 18;
const PAUSE_AFTER_TYPE = 1600;
const PAUSE_AFTER_DELETE = 380;

interface ProductRequestFormProps {
  searchQuery?: string;
}

export function ProductRequestForm({ searchQuery }: ProductRequestFormProps) {
  const [product, setProduct] = useState(searchQuery ?? "");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Typewriter state — only active when the product field is empty and unfocused
  const [displayed, setDisplayed] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pausing" | "deleting">("typing");
  const [userActive, setUserActive] = useState(!!searchQuery);
  const productRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userActive) return;

    const target = SPECIFIC_EXAMPLES[exampleIdx]!;

    if (phase === "typing") {
      if (displayed.length < target.length) {
        const t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), TYPE_SPEED);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("pausing"), PAUSE_AFTER_TYPE);
      return () => clearTimeout(t);
    }

    if (phase === "pausing") {
      setPhase("deleting");
      return;
    }

    if (phase === "deleting") {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), DELETE_SPEED);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => {
        setExampleIdx((i) => (i + 1) % SPECIFIC_EXAMPLES.length);
        setPhase("typing");
      }, PAUSE_AFTER_DELETE);
      return () => clearTimeout(t);
    }
  }, [displayed, phase, exampleIdx, userActive]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product.trim() || !email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/product-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productQuery: product.trim(), userEmail: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }

      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold text-emerald-900">Request received!</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            We&apos;ll email you at <span className="font-medium">{email}</span> as soon as{" "}
            <span className="font-medium">{product}</span> is available on {APP_NAME}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-stone-700">
          Want us to add it? Tell us exactly what you need.
        </p>
        <p className="mt-0.5 text-xs text-stone-400">
          Please be specific — include the brand, size, or model so we can find the right one.
        </p>
      </div>

      <div className="space-y-2">
        {/* Product field with typewriter animation */}
        <div className="relative">
          {!userActive && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center px-4 text-sm text-stone-400"
            >
              <span className="truncate">{displayed}</span>
              <span className="animate-blink ml-px inline-block h-4 w-[1.5px] shrink-0 bg-stone-300" />
            </div>
          )}
          <input
            ref={productRef}
            type="text"
            value={product}
            onChange={(e) => {
              setUserActive(true);
              setProduct(e.target.value);
            }}
            onKeyDown={() => setUserActive(true)}
            onFocus={() => setUserActive(true)}
            onBlur={() => {
              if (!product) {
                setUserActive(false);
                setDisplayed("");
                setPhase("typing");
              }
            }}
            required
            className={`w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 ${
              userActive ? "text-stone-900" : "text-transparent caret-transparent"
            }`}
          />
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email — we'll notify you when it's added"
          required
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading" || !product.trim() || !email.trim()}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-400/25 transition hover:from-orange-600 hover:to-amber-600 disabled:opacity-40"
      >
        {status === "loading" ? (
          <><Loader2 size={15} className="animate-spin" /> Sending…</>
        ) : (
          <>Request this product <ArrowRight size={15} /></>
        )}
      </button>
    </form>
  );
}
