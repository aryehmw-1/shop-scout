/**
 * Shared proxy-config assembly for standalone node scripts.
 *
 * Mirrors the logic in src/lib/net/proxy-routing.ts so that `test:proxy`,
 * `simulate:nightly`, and `report:ops` discover proxies the same way the
 * app runtime does.
 *
 * Supported configuration shapes (any of these works):
 *   - Canonical residential: PROXY_HOST / PROXY_PORT / PROXY_USERNAME / PROXY_PASSWORD
 *   - Legacy residential:    DECODO_RESI_HOST / _PORT / _USERNAME / _PASSWORD
 *   - Component form:          DECODO_PROXY_HOST / _PORT / _USERNAME / _PASSWORD
 *   - Component form:          INDEX_PROXY_HOST / _PORT / _USERNAME / _PASSWORD
 *   - Full URL:                DECODO_PROXY_URL, INDEX_PROXY_URL
 *   - List of URLs:            DECODO_PROXY_LIST, INDEX_PROXY_LIST (comma/space/newline)
 */

function parseList(raw) {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidProxyUrl(url) {
  const u = url?.trim();
  if (!u) return false;
  if (/USER:PASS|@proxy:PORT|your-proxy|proxy\.example/i.test(u)) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Build a proxy URL from discrete component env vars under a given prefix. */
export function buildProxyUrlFromParts(prefix, env = process.env) {
  const host = env[`${prefix}_HOST`]?.trim();
  if (!host) return undefined;
  const port = env[`${prefix}_PORT`]?.trim();
  const user = env[`${prefix}_USERNAME`]?.trim();
  const pass = env[`${prefix}_PASSWORD`]?.trim();
  const scheme = (env[`${prefix}_PROTOCOL`]?.trim() || "http").replace(/:.*$/, "");
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass ?? "")}@` : "";
  const portPart = port ? `:${port}` : "";
  return `${scheme}://${auth}${host}${portPart}`;
}

function isProxyEnabled(env = process.env) {
  const flag = env.INDEX_PROXY_ENABLED?.trim().toLowerCase();
  if (flag === undefined || flag === "") return true;
  return flag !== "false" && flag !== "0" && flag !== "off" && flag !== "no";
}

export function getProxyPool(env = process.env) {
  if (!isProxyEnabled(env)) return [];
  const candidates = [
    ...parseList(env.INDEX_PROXY_LIST),
    ...(env.INDEX_PROXY_URL?.trim() ? [env.INDEX_PROXY_URL.trim()] : []),
    buildProxyUrlFromParts("INDEX_PROXY", env),
    ...parseList(env.DECODO_PROXY_LIST),
    ...(env.DECODO_PROXY_URL?.trim() ? [env.DECODO_PROXY_URL.trim()] : []),
    buildProxyUrlFromParts("DECODO_PROXY", env),
  ].filter(Boolean);
  return [...new Set(candidates)].filter(isValidProxyUrl);
}

export function classifyProvider(url) {
  if (!url) return "none";
  return /decodo|smartproxy|gate\.smartproxy|dc\.decodo/i.test(url) ? "decodo" : "custom";
}

export function getResidentialEnv(env = process.env) {
  const host = env.PROXY_HOST?.trim() ?? env.DECODO_RESI_HOST?.trim() ?? "gate.decodo.com";
  const port = env.PROXY_PORT?.trim() ?? env.DECODO_RESI_PORT?.trim() ?? "10001";
  const username = env.PROXY_USERNAME?.trim() ?? env.DECODO_RESI_USERNAME?.trim();
  const password = env.PROXY_PASSWORD?.trim() ?? env.DECODO_RESI_PASSWORD?.trim();
  if (!username || !password) return undefined;
  const scheme = (env.PROXY_PROTOCOL?.trim() ?? env.DECODO_RESI_PROTOCOL?.trim() ?? "http").replace(
    /:.*$/,
    "",
  );
  return { host, port, username, password, scheme };
}

export function redactProxyUsername(username) {
  if (!username || username.length <= 12) return `${(username ?? "").slice(0, 4)}***`;
  return `${username.slice(0, 10)}…${username.slice(-12)}`;
}

function usernameHasCountryTargeting(username) {
  return /-country-[a-z]{2}\b/i.test(username);
}

function resolveCountry(opts, baseUsername, env) {
  if (baseUsername && usernameHasCountryTargeting(baseUsername)) return undefined;
  const raw = (opts.country ?? env.DECODO_RESI_COUNTRY?.trim() ?? "us").toLowerCase();
  if (!raw || raw === "any" || raw === "all") return undefined;
  return raw;
}

export function residentialUsername(base, opts = {}, env = process.env) {
  const country = resolveCountry(opts, base, env);
  const region = opts.region ?? env.DECODO_RESI_REGION?.trim();
  const durationEnv = env.DECODO_RESI_SESSION_DURATION?.trim();
  const duration = opts.sessionDurationMin ?? (durationEnv ? parseInt(durationEnv, 10) : undefined);
  let u = base;
  if (country) u += `-country-${country}`;
  if (region) u += `-state-${region}`;
  if (opts.sessionId) u += `-session-${opts.sessionId}`;
  if (opts.sessionId && Number.isFinite(duration) && duration > 0) {
    u += `-sessionduration-${duration}`;
  }
  return u;
}

export function resolveResidentialProxy(opts = {}, env = process.env) {
  const resi = getResidentialEnv(env);
  if (!resi) return undefined;
  const user = residentialUsername(resi.username, opts, env);
  const url = `${resi.scheme}://${encodeURIComponent(user)}:${encodeURIComponent(resi.password)}@${resi.host}:${resi.port}`;
  if (!isValidProxyUrl(url)) return undefined;
  return { ...resi, username: user, url, sticky: Boolean(opts.sessionId) };
}

export function proxyRedacted(url) {
  if (!url) return "none";
  try {
    const u = new URL(url);
    const auth = u.username || u.password ? "***:***@" : "";
    return `${u.protocol}//${auth}${u.host}`;
  } catch {
    return "invalid-proxy-url";
  }
}

/**
 * Diagnostic snapshot of proxy env detection (safe to log — credentials
 * are redacted). Emits a warning when partial component vars are present
 * but no valid proxy URL could be assembled.
 */
export function describeProxyConfig(env = process.env) {
  const pool = getProxyPool(env);
  const componentPrefixes = ["DECODO_PROXY", "INDEX_PROXY"];
  const componentState = componentPrefixes.map((prefix) => {
    const host = env[`${prefix}_HOST`];
    const port = env[`${prefix}_PORT`];
    const user = env[`${prefix}_USERNAME`];
    const pass = env[`${prefix}_PASSWORD`];
    const present = Boolean(host || port || user || pass);
    const url = buildProxyUrlFromParts(prefix, env);
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

  const resiEnv = getResidentialEnv(env);
  const resiResolved = resolveResidentialProxy({}, env);
  componentState.push({
    prefix: env.PROXY_USERNAME ? "PROXY" : "DECODO_RESI",
    present: Boolean(resiEnv),
    hasHost: Boolean(resiEnv?.host),
    hasPort: Boolean(resiEnv?.port),
    hasUsername: Boolean(resiEnv?.username),
    hasPassword: Boolean(resiEnv?.password),
    assembled: resiResolved ? proxyRedacted(resiResolved.url) : undefined,
    valid: Boolean(resiResolved),
  });

  const warnings = [];
  if (!isProxyEnabled(env)) {
    warnings.push("INDEX_PROXY_ENABLED is falsy — proxy routing disabled, forcing direct mode.");
  }
  for (const c of componentState) {
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
  if (pool.length === 0 && componentState.every((c) => !c.present) && isProxyEnabled(env)) {
    warnings.push(
      "No proxy env vars detected (DECODO_PROXY_* / INDEX_PROXY_*). Running in direct mode.",
    );
  }

  const datacenterConfigured = Boolean(
    buildProxyUrlFromParts("DECODO_DC", env) ||
      buildProxyUrlFromParts("DECODO_PROXY", env) ||
      env.DECODO_PROXY_URL?.trim() ||
      env.INDEX_PROXY_URL?.trim(),
  );
  const residentialConfigured = Boolean(getResidentialEnv(env));

  return {
    enabled: isProxyEnabled(env),
    configuredCount: pool.length,
    chosenProxy: proxyRedacted(pool[0]),
    provider: classifyProvider(pool[0]),
    mode: pool.length ? (env.INDEX_PROXY_MODE?.trim() || "datacenter") : "direct",
    components: componentState,
    pool: pool.map(proxyRedacted),
    transports: {
      direct: true,
      datacenter: datacenterConfigured,
      residential: residentialConfigured,
    },
    warnings,
  };
}
