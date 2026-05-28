"use client";

import { useSearchParams } from "next/navigation";
import { ChatApp } from "@/components/ChatApp";

/** Category shortcuts only — never auto-send placeholder URLs */
const CATEGORY_STARTS: Record<string, string> = {
  shoes: "running shoes",
  clothing: "mens hoodie",
  sports: "basketball",
  dairy: "milk and eggs",
  meat: "boneless chicken breast",
  household: "paper towels",
  salad: "salad greens",
  pantry: "ground coffee",
  produce: "bananas",
  bakery: "whole wheat bread",
};

export function ChatPageClient() {
  const params = useSearchParams();
  const start = params.get("start");
  const hint = params.get("hint");

  const pasteLinkMode = hint === "link" || start === "link";

  const initialMessage =
    start && !pasteLinkMode
      ? CATEGORY_STARTS[start] ?? `I'm looking for ${start}`
      : undefined;

  return <ChatApp initialMessage={initialMessage} inputHint={pasteLinkMode ? "link" : undefined} />;
}
