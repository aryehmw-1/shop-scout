"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ShoppingCart } from "lucide-react";

const EXAMPLES = [
  "Compare iPhone 17 prices across all websites",
  "Find me the cheapest Beats Studio Pro headphones",
  "What's the lowest price on vanilla ice cream?",
  "Whole milk gallon — cheapest store near me",
  "Honey Nut Cheerios best price",
  "Bounty paper towels bulk deal",
];

const TYPE_SPEED = 48;
const DELETE_SPEED = 22;
const PAUSE_AFTER_TYPE = 1800;
const PAUSE_AFTER_DELETE = 420;

interface Props {
  onSearch: (query: string) => void;
}

export function TypewriterInput({ onSearch }: Props) {
  const [displayed, setDisplayed] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pausing" | "deleting" | "waiting">("typing");

  const [mode, setMode] = useState<"animating" | "focused" | "typing">("animating");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "animating") return;

    const target = EXAMPLES[exampleIdx]!;

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
        setExampleIdx((i) => (i + 1) % EXAMPLES.length);
        setPhase("typing");
      }, PAUSE_AFTER_DELETE);
      return () => clearTimeout(t);
    }
  }, [displayed, phase, exampleIdx, mode]);

  function handleFocus() {
    if (mode === "animating") {
      setMode("focused");
      setDisplayed("");
    }
  }

  function handleBlur() {
    // Once the user has clicked the field, keep it in focused/typing mode permanently
    // (never resume the animation)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMode("typing");
    setValue(e.target.value);
    if (e.target.value === "") setMode("focused");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "animating") {
      // No user input — open chat with welcome screen
      onSearch("");
      return;
    }
    const q = value.trim();
    if (!q) return;
    onSearch(q);
  }

  const showAnimation = mode === "animating";
  const showPlaceholder = mode === "focused";
  const inputVal = mode === "typing" ? value : "";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 flex w-full max-w-3xl items-center rounded-3xl border border-stone-200 bg-white shadow-[0_16px_60px_rgba(41,37,36,0.10)] focus-within:border-orange-300"
    >
      <label htmlFor="home-search" className="sr-only">
        Product to compare
      </label>
      <Search size={22} className="ml-6 shrink-0 text-stone-400" aria-hidden />

      <div className="relative min-w-0 flex-1">
        {showAnimation && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center pl-3 pr-3 text-lg"
          >
            <span className="truncate text-stone-400">{displayed}</span>
            <span className="ml-0.5 inline-block h-6 w-[2px] shrink-0 animate-blink bg-orange-400" />
          </div>
        )}

        <input
          ref={inputRef}
          id="home-search"
          name="q"
          type="search"
          autoComplete="off"
          value={inputVal}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={showPlaceholder ? "Ask for a product or paste a link…" : ""}
          className={`w-full bg-transparent py-8 pl-3 pr-3 text-lg outline-none placeholder:text-stone-400 ${
            showAnimation ? "text-transparent caret-transparent" : "text-stone-900"
          }`}
        />
      </div>

      {/* Submit button — inside the box on the right */}
      <button
        type="submit"
        aria-label="Search"
        className="mr-3 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-400/30 transition hover:from-orange-600 hover:to-amber-600"
      >
        <ShoppingCart size={24} strokeWidth={2} aria-hidden />
      </button>
    </form>
  );
}
