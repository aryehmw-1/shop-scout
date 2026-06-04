import type { ProductOffer, UserAddress, UserPreferences } from "./types";

const SAVED_KEY = "homivion-saved-offers";
const PREFS_KEY = "homivion-prefs";
const ADDRESS_KEY = "homivion-address";

export function loadSavedOffers(): ProductOffer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as ProductOffer[]) : [];
  } catch {
    return [];
  }
}

export function saveOffers(offers: ProductOffer[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(offers));
}

export function toggleSavedOffer(offer: ProductOffer): ProductOffer[] {
  const current = loadSavedOffers();
  const idx = current.findIndex((o) => o.id === offer.id);
  let next: ProductOffer[];
  if (idx >= 0) {
    next = current.filter((o) => o.id !== offer.id);
  } else {
    next = [offer, ...current];
  }
  saveOffers(next);
  return next;
}

export function loadAddress(): UserAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADDRESS_KEY);
    return raw ? (JSON.parse(raw) as UserAddress) : null;
  } catch {
    return null;
  }
}

/** Writes prefs + zip only — never calls saveAddress (avoids infinite loop). */
function writePreferencesOnly(prefs: UserPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  if (prefs.zipCode) {
    localStorage.setItem("homivion-zip", prefs.zipCode);
  }
}

export function saveAddress(address: UserAddress) {
  localStorage.setItem(ADDRESS_KEY, JSON.stringify(address));
  localStorage.setItem("homivion-zip", address.zipCode);
  const prefs = loadPreferences();
  writePreferencesOnly({
    ...prefs,
    zipCode: address.zipCode,
    locationSet: address.zipCode.length === 5,
  });
}

export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") {
    return { zipCode: "" };
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const addr = loadAddress();
    if (raw) {
      const prefs = JSON.parse(raw) as UserPreferences;
      if (addr?.zipCode) prefs.zipCode = addr.zipCode;
      return prefs;
    }
    const zip =
      addr?.zipCode ?? localStorage.getItem("homivion-zip") ?? "";
    return { zipCode: zip, locationSet: zip.length === 5 };
  } catch {
    return { zipCode: "" };
  }
}

export function savePreferences(prefs: UserPreferences) {
  writePreferencesOnly(prefs);
  if (prefs.zipCode) {
    const existing = loadAddress();
    localStorage.setItem(
      ADDRESS_KEY,
      JSON.stringify({
        ...(existing ?? { label: "Home" }),
        zipCode: prefs.zipCode,
      }),
    );
  }
}
