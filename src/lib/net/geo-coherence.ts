/**
 * Geo-coherence: keep the browser session identity consistent with the proxy's
 * egress geography. Walmart's PerimeterX flagged a session whose IP was in
 * Brazil while the browser advertised en-US / America/New_York for a US store.
 * This module supplies per-country browser profiles (locale, timezone,
 * Accept-Language) and scores coherence across IP geo / timezone / locale /
 * retailer country so mismatches are explicit.
 */
export interface GeoProfile {
  country: string; // ISO-3166 alpha-2, lowercase
  locale: string; // e.g. en-US
  timezone: string; // IANA tz
  acceptLanguage: string;
}

const PROFILES: Record<string, GeoProfile> = {
  us: { country: "us", locale: "en-US", timezone: "America/New_York", acceptLanguage: "en-US,en;q=0.9" },
  ca: { country: "ca", locale: "en-CA", timezone: "America/Toronto", acceptLanguage: "en-CA,en;q=0.9,fr-CA;q=0.8" },
  gb: { country: "gb", locale: "en-GB", timezone: "Europe/London", acceptLanguage: "en-GB,en;q=0.9" },
  au: { country: "au", locale: "en-AU", timezone: "Australia/Sydney", acceptLanguage: "en-AU,en;q=0.9" },
  br: { country: "br", locale: "pt-BR", timezone: "America/Sao_Paulo", acceptLanguage: "pt-BR,pt;q=0.9,en;q=0.8" },
  de: { country: "de", locale: "de-DE", timezone: "Europe/Berlin", acceptLanguage: "de-DE,de;q=0.9,en;q=0.8" },
  fr: { country: "fr", locale: "fr-FR", timezone: "Europe/Paris", acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8" },
  mx: { country: "mx", locale: "es-MX", timezone: "America/Mexico_City", acceptLanguage: "es-MX,es;q=0.9,en;q=0.8" },
};

const DEFAULT_PROFILE = PROFILES.us;

export function getGeoProfile(country: string | undefined): GeoProfile {
  if (!country) return DEFAULT_PROFILE;
  return PROFILES[country.toLowerCase()] ?? DEFAULT_PROFILE;
}

/** Default storefront country per retailer (all US retail for now). */
export function retailerCountry(retailerId: string): string {
  void retailerId;
  return "us";
}

/** Country implied by a locale string, e.g. "en-US" -> "us". */
export function localeCountry(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  const m = locale.match(/[-_]([A-Za-z]{2})\b/);
  return m ? m[1].toLowerCase() : undefined;
}

/** Coarse country for an IANA timezone (covers our supported profiles). */
export function timezoneCountry(tz: string | undefined): string | undefined {
  if (!tz) return undefined;
  const map: Record<string, string> = {
    "America/New_York": "us",
    "America/Chicago": "us",
    "America/Denver": "us",
    "America/Los_Angeles": "us",
    "America/Phoenix": "us",
    "America/Toronto": "ca",
    "America/Vancouver": "ca",
    "Europe/London": "gb",
    "Europe/Berlin": "de",
    "Europe/Paris": "fr",
    "Australia/Sydney": "au",
    "America/Sao_Paulo": "br",
    "America/Mexico_City": "mx",
  };
  if (map[tz]) return map[tz];
  if (tz.startsWith("America/")) return "us"; // best-effort for US-ish zones
  return undefined;
}

export interface CoherenceInput {
  ipCountry?: string; // from outbound identity probe
  locale?: string; // browser context locale
  timezone?: string; // browser context timezone
  retailerCountry?: string;
}

export interface CoherenceResult {
  score: number; // 0..1, 1 = fully coherent
  mismatches: string[];
  ipCountry?: string;
  localeCountry?: string;
  timezoneCountry?: string;
  retailerCountry?: string;
}

/**
 * Score how consistent the session identity is. Each axis that disagrees with
 * the IP geo (the hardest-to-fake signal) costs points; disagreement with the
 * retailer's storefront country is the most damaging.
 */
export function scoreTransportCoherence(input: CoherenceInput): CoherenceResult {
  const ip = input.ipCountry?.toLowerCase();
  const loc = localeCountry(input.locale);
  const tz = timezoneCountry(input.timezone);
  const retailer = input.retailerCountry?.toLowerCase();

  const mismatches: string[] = [];
  let penalty = 0;

  if (ip && retailer && ip !== retailer) {
    mismatches.push(`ip_geo(${ip}) != retailer_country(${retailer})`);
    penalty += 0.5;
  }
  if (ip && loc && ip !== loc) {
    mismatches.push(`ip_geo(${ip}) != locale(${loc})`);
    penalty += 0.25;
  }
  if (ip && tz && ip !== tz) {
    mismatches.push(`ip_geo(${ip}) != timezone(${tz})`);
    penalty += 0.25;
  }
  if (loc && retailer && loc !== retailer) {
    mismatches.push(`locale(${loc}) != retailer_country(${retailer})`);
    penalty += 0.1;
  }

  const score = Math.max(0, Math.round((1 - penalty) * 100) / 100);
  return {
    score,
    mismatches,
    ipCountry: ip,
    localeCountry: loc,
    timezoneCountry: tz,
    retailerCountry: retailer,
  };
}
