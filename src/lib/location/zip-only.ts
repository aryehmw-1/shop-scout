import type { UserAddress } from "../types";

/** Location context is ZIP-only — no street-level data required. */
export function normalizeZip(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 5);
}

export function isValidUsZip(zip: string): boolean {
  return /^\d{5}$/.test(zip);
}

export function zipOnlyAddress(zip: string, label = "Home"): UserAddress {
  return {
    zipCode: normalizeZip(zip),
    label,
  };
}
