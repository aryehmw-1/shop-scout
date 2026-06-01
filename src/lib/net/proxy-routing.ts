import type { RetailerId } from "../types";

export type ProxyMode = "direct" | "datacenter" | "residential";

export interface ProxyRoute {
  mode: ProxyMode;
  proxyUrl?: string;
  provider: "none" | "decodo" | "custom";
}

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidProxyUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/USER:PASS|@proxy:PORT|your-proxy|proxy\.example/i.test(u)) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Assemble a proxy URL from discrete component env vars under a prefix, e.g.
 * DECODO_PROXY_HOST / _PORT / _USERNAME / _PASSWORD. Credentials are
 * URL-encoded so special characters (~, @, :, /) in passwords are safe.
 */
export function buildProxyUrlFromParts(prefix: string): string | undefined {
  const host = process.env[`${prefix}_HOST`]?.trim();
  if (!host) return undefined;
  const port = process.env[`${prefix}_PORT`]?.trim();
  const user = process.env[`${prefix}_USERNAME`]?.trim();
  const pass = process.env[`${prefix}_PASSWORD`]?.trim();
  const scheme = (process.env[`${prefix}_PROTOCOL`]?.trim() || "http").replace(/:.*$/, "");
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass ?? "")}@` : "";
  const portPart = port ? `:${port}` : "";
  return `${scheme}://${auth}${host}${portPart}`;
}

export function isProxyEnabled(): boolean {
  const flag = process.env.INDEX_PROXY_ENABLED?.trim().toLowerCase();
  if (flag === undefined || flag === "") return true;
  return flag !== "false" && flag !== "0" && flag !== "off" && flag !== "no";
}

export type ProxyTransport = "direct" | "datacenter" | "residential";

export interface TransportProxy {
  transport: ProxyTransport;
  url?: string;
  configured: boolean;
  /** Residential with a pinned session id (sticky). */
  sticky: boolean;
}

export interface TransportProxyOptions {
  sessionId?: string;
  /** ISO country code for geo-targeted residential exit (default "us"). */
  country?: string;
  /** Optional state/region (Decodo: `-state-us_california`) for finer geo. */
  region?: string;
  /** Sticky session lifetime in minutes (Decodo: `-sessionduration-N`). */
  sessionDurationMin?: number;
}

/** Resolve residential proxy components. PROXY_* is the canonical shape for
 * verified Decodo credentials; DECODO_RESI_* is kept as a legacy alias. */
export function getResidentialEnv(): {
  host: string;
  port: string;
  username: string;
  password: string;
  scheme: string;
} | undefined {
  const host =
    process.env.PROXY_HOST?.trim() ??
    process.env.DECODO_RESI_HOST?.trim() ??
    "gate.decodo.com";
  const port =
    process.env.PROXY_PORT?.trim() ??
    process.env.DECODO_RESI_PORT?.trim() ??
    "10001";
  const username =
    process.env.PROXY_USERNAME?.trim() ??
    process.env.DECODO_RESI_USERNAME?.trim();
  const password =
    process.env.PROXY_PASSWORD?.trim() ??
    process.env.DECODO_RESI_PASSWORD?.trim();
  if (!username || !password) return undefined;
  const scheme = (
    process.env.PROXY_PROTOCOL?.trim() ??
    process.env.DECODO_RESI_PROTOCOL?.trim() ??
    "http"
  ).replace(/:.*$/, "");
  return { host, port, username, password, scheme };
}

/** True when the username already embeds Decodo geo targeting. */
function usernameHasCountryTargeting(username: string): boolean {
  return /-country-[a-z]{2}\b/i.test(username);
}

/** Redacted username safe for logs (shows prefix/suffix, masks middle). */
export function redactProxyUsername(username: string): string {
  if (username.length <= 12) return `${username.slice(0, 4)}***`;
  return `${username.slice(0, 10)}…${username.slice(-12)}`;
}

export interface ResolvedResidentialProxy {
  host: string;
  port: string;
  username: string;
  password: string;
  scheme: string;
  url: string;
  /** Whether geo suffixes were appended vs taken verbatim from env. */
  geoAppended: boolean;
  sticky: boolean;
}

/** Build the final residential proxy URL + metadata (for logging/diagnostics). */
export function resolveResidentialProxy(
  opts: TransportProxyOptions = {},
): ResolvedResidentialProxy | undefined {
  const env = getResidentialEnv();
  if (!env) return undefined;
  const user = residentialUsername(env.username, opts);
  const url = `${env.scheme}://${encodeURIComponent(user)}:${encodeURIComponent(env.password)}@${env.host}:${env.port}`;
  if (!isValidProxyUrl(url)) return undefined;
  return {
    ...env,
    username: user,
    url,
    geoAppended: user !== env.username && !usernameHasCountryTargeting(env.username),
    sticky: Boolean(opts.sessionId),
  };
}

/** "any"/"all"/"" disable country targeting. */
function resolveCountry(opts: TransportProxyOptions, baseUsername?: string): string | undefined {
  if (baseUsername && usernameHasCountryTargeting(baseUsername)) return undefined;
  const raw = (opts.country ?? process.env.DECODO_RESI_COUNTRY?.trim() ?? "us").toLowerCase();
  if (!raw || raw === "any" || raw === "all") return undefined;
  return raw;
}

/**
 * Decodo residential username with sticky-session + geo targeting. Decodo /
 * Smartproxy residential gateways encode geo + session in the username:
 *   user-<acct>-country-us-state-us_new_york-session-<id>-sessionduration-10
 * Defaults to country=us (this is a US retail platform; an untargeted exit
 * previously resolved to Brazil and tripped Walmart's geo signal).
 * Override the whole shape via DECODO_RESI_USER_TEMPLATE using
 * {user}/{session}/{country}/{region}.
 */
export function residentialUsername(
  base: string,
  opts: TransportProxyOptions = {},
): string {
  const country = resolveCountry(opts, base);
  const region = opts.region ?? process.env.DECODO_RESI_REGION?.trim();
  const durationEnv = process.env.DECODO_RESI_SESSION_DURATION?.trim();
  const duration =
    opts.sessionDurationMin ?? (durationEnv ? parseInt(durationEnv, 10) : undefined);

  const tmpl = process.env.DECODO_RESI_USER_TEMPLATE?.trim();
  if (tmpl) {
    return tmpl
      .replace("{user}", base)
      .replace("{session}", opts.sessionId ?? "")
      .replace("{country}", country ?? "")
      .replace("{region}", region ?? "");
  }
  let u = base;
  if (country) u += `-country-${country}`;
  if (region) u += `-state-${region}`;
  if (opts.sessionId) u += `-session-${opts.sessionId}`;
  if (opts.sessionId && Number.isFinite(duration) && (duration as number) > 0) {
    u += `-sessionduration-${duration}`;
  }
  return u;
}

/**
 * Resolve a concrete proxy URL for a transport tier. Datacenter pulls from
 * DECODO_DC_* (falling back to the generic DECODO_PROXY_* / *_URL); residential
 * pulls from DECODO_RESI_* and supports sticky sessions + country targeting.
 * Credentials are URL-encoded; nothing is hardcoded.
 */
export function getProxyForTransport(
  transport: ProxyTransport,
  opts: TransportProxyOptions = {},
): TransportProxy {
  if (transport === "direct") {
    return { transport, configured: true, sticky: false };
  }

  if (transport === "datacenter") {
    const url =
      buildProxyUrlFromParts("DECODO_DC") ??
      buildProxyUrlFromParts("DECODO_PROXY") ??
      process.env.DECODO_PROXY_URL?.trim() ??
      process.env.INDEX_PROXY_URL?.trim();
    const ok = Boolean(url && isValidProxyUrl(url));
    return { transport, url: ok ? url : undefined, configured: ok, sticky: false };
  }

  // residential — PROXY_* (canonical) or DECODO_RESI_* (legacy alias)
  const resolved = resolveResidentialProxy(opts);
  if (!resolved) {
    return { transport, configured: false, sticky: false };
  }
  return {
    transport,
    url: resolved.url,
    configured: true,
    sticky: resolved.sticky,
  };
}

/** Which transport tiers are configured/usable right now. */
export function availableTransports(): ProxyTransport[] {
  const out: ProxyTransport[] = ["direct"];
  if (getProxyForTransport("datacenter").configured) out.push("datacenter");
  if (getProxyForTransport("residential").configured) out.push("residential");
  return out;
}

/** Generate a random sticky session id for residential pinning. */
export function newStickySessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function getProxyPool(): string[] {
  if (!isProxyEnabled()) return [];

  const explicit = parseList(process.env.INDEX_PROXY_LIST);
  const single = process.env.INDEX_PROXY_URL?.trim();
  const indexParts = buildProxyUrlFromParts("INDEX_PROXY");
  const decodoList = parseList(process.env.DECODO_PROXY_LIST);
  const decodoSingle = process.env.DECODO_PROXY_URL?.trim();
  const decodoParts = buildProxyUrlFromParts("DECODO_PROXY");

  const pool = [
    ...explicit,
    ...(single ? [single] : []),
    ...(indexParts ? [indexParts] : []),
    ...decodoList,
    ...(decodoSingle ? [decodoSingle] : []),
    ...(decodoParts ? [decodoParts] : []),
  ];

  return [...new Set(pool)].filter(isValidProxyUrl);
}

export function shouldProxyRetailer(retailerId?: RetailerId): boolean {
  if (!retailerId) return getProxyPool().length > 0;
  const forced = process.env.INDEX_PROXY_FORCE_ALL === "1";
  if (forced) return getProxyPool().length > 0;
  const list =
    process.env.INDEX_PROXY_RETAILERS?.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()) ??
    ["walmart", "target", "amazon", "kroger", "costco"];
  return list.includes(retailerId);
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickProxyRoute(input: {
  retailerId?: RetailerId;
  seed: string;
  attempt: number;
}): ProxyRoute {
  const preferDirectFirst = (process.env.INDEX_PROXY_DIRECT_FIRST ?? "1") !== "0";
  const pool = getProxyPool();
  const retailerNeedsProxy = shouldProxyRetailer(input.retailerId);

  if (!pool.length || (!retailerNeedsProxy && !process.env.INDEX_PROXY_FORCE_ALL)) {
    return { mode: "direct", provider: "none" };
  }

  if (preferDirectFirst && input.attempt === 1) {
    return { mode: "direct", provider: "none" };
  }

  const idx = hashSeed(`${input.seed}:${input.attempt}`) % pool.length;
  const proxyUrl = pool[idx]!;
  const provider =
    /decodo|smartproxy|spys\.one|gate\.smartproxy|dc\.decodo/i.test(proxyUrl) ? "decodo" : "custom";
  return { mode: "datacenter", proxyUrl, provider };
}

export async function getUndiciDispatcher(proxyUrl?: string) {
  if (!proxyUrl) return undefined;
  const { ProxyAgent } = await import("undici");
  return new ProxyAgent(proxyUrl);
}

export function getAxiosProxyConfig(proxyUrl?: string): {
  proxy?: { protocol: string; host: string; port: number; auth?: { username: string; password: string } };
} {
  if (!proxyUrl) return {};
  try {
    const p = new URL(proxyUrl);
    return {
      proxy: {
        protocol: p.protocol.replace(":", ""),
        host: p.hostname,
        port: Number(p.port || (p.protocol === "https:" ? 443 : 80)),
        auth:
          p.username || p.password ?
            { username: decodeURIComponent(p.username), password: decodeURIComponent(p.password) }
          : undefined,
      },
    };
  } catch {
    return {};
  }
}

export function getPlaywrightProxyConfig(proxyUrl?: string): { server: string; username?: string; password?: string } | undefined {
  if (!proxyUrl) return undefined;
  try {
    const p = new URL(proxyUrl);
    return {
      server: `${p.protocol}//${p.hostname}${p.port ? `:${p.port}` : ""}`,
      username: p.username ? decodeURIComponent(p.username) : undefined,
      password: p.password ? decodeURIComponent(p.password) : undefined,
    };
  } catch {
    return undefined;
  }
}

export function proxyRedacted(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const auth = u.username || u.password ? "***:***@" : "";
    return `${u.protocol}//${auth}${u.host}`;
  } catch {
    return "invalid-proxy-url";
  }
}

export interface ProxyConfigDiagnostic {
  enabled: boolean;
  configuredCount: number;
  chosenProxy?: string;
  provider: "none" | "decodo" | "custom";
  mode: ProxyMode;
  components: Array<{
    prefix: string;
    present: boolean;
    hasHost: boolean;
    hasPort: boolean;
    hasUsername: boolean;
    hasPassword: boolean;
    assembled?: string;
    valid: boolean;
  }>;
  pool: string[];
  transports: {
    direct: boolean;
    datacenter: boolean;
    residential: boolean;
  };
  warnings: string[];
}

/**
 * Redacted snapshot of proxy env detection. Safe to log and to surface in
 * /api/debug endpoints — never exposes credentials. Emits warnings when
 * component vars are partially set but no valid proxy URL could be built,
 * or when proxying is explicitly disabled.
 */
export function describeProxyConfig(): ProxyConfigDiagnostic {
  const pool = getProxyPool();
  const enabled = isProxyEnabled();
  const prefixes = ["DECODO_PROXY", "INDEX_PROXY"] as const;

  const components: ProxyConfigDiagnostic["components"] = prefixes.map((prefix) => {
    const host = process.env[`${prefix}_HOST`];
    const port = process.env[`${prefix}_PORT`];
    const user = process.env[`${prefix}_USERNAME`];
    const pass = process.env[`${prefix}_PASSWORD`];
    const present = Boolean(host || port || user || pass);
    const url = buildProxyUrlFromParts(prefix);
    return {
      prefix,
      present,
      hasHost: Boolean(host),
      hasPort: Boolean(port),
      hasUsername: Boolean(user),
      hasPassword: Boolean(pass),
      assembled: url ? proxyRedacted(url) : undefined,
      valid: url ? isValidProxyUrl(url) : false,
    };
  });

  const resiEnv = getResidentialEnv();
  const resiTp = getProxyForTransport("residential");
  components.push({
    prefix: resiEnv && process.env.PROXY_USERNAME ? "PROXY" : "DECODO_RESI",
    present: Boolean(resiEnv),
    hasHost: Boolean(resiEnv?.host),
    hasPort: Boolean(resiEnv?.port),
    hasUsername: Boolean(resiEnv?.username),
    hasPassword: Boolean(resiEnv?.password),
    assembled: resiTp.url ? proxyRedacted(resiTp.url) : undefined,
    valid: resiTp.configured,
  });

  const warnings: string[] = [];
  if (!enabled) {
    warnings.push("INDEX_PROXY_ENABLED is falsy — proxy routing disabled, forcing direct mode.");
  }
  for (const c of components) {
    if (c.present && !c.valid) {
      const missing = [
        !c.hasHost && "HOST",
        !c.hasPort && "PORT",
        !c.hasUsername && "USERNAME",
        !c.hasPassword && "PASSWORD",
      ].filter(Boolean);
      warnings.push(
        `${c.prefix}_* vars present but no valid proxy URL assembled` +
          (missing.length ? ` (missing/empty: ${missing.join(", ")})` : ""),
      );
    }
  }
  if (enabled && pool.length === 0 && components.every((c) => !c.present)) {
    warnings.push(
      "No proxy env vars detected (DECODO_PROXY_* / INDEX_PROXY_*). Running in direct mode.",
    );
  }

  return {
    enabled,
    configuredCount: pool.length,
    chosenProxy: proxyRedacted(pool[0]),
    provider:
      pool[0] ?
        /decodo|smartproxy|gate\.smartproxy|dc\.decodo/i.test(pool[0]) ? "decodo" : "custom"
      : "none",
    mode: pool.length ? "datacenter" : "direct",
    components,
    pool: pool.map((u) => proxyRedacted(u) ?? "invalid"),
    transports: {
      direct: true,
      datacenter: getProxyForTransport("datacenter").configured,
      residential: getProxyForTransport("residential").configured,
    },
    warnings,
  };
}
