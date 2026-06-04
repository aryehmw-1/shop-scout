import type { RetailerId } from "@/lib/types";

/** Anonymous aggregate interaction signals — never factual evidence. */
export interface TrustMemoryStore {
  version: 1;
  updatedAt: string;
  retailers: Partial<
    Record<
      RetailerId,
      { clicks: number; saves: number; ignores: number; reversals: number }
    >
  >;
  canonicals: Record<
    string,
    { clicks: number; saves: number; ignores: number }
  >;
}

export type TrustMemoryEventType = "click" | "save" | "ignore" | "reversal";
