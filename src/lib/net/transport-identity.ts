import { getUndiciDispatcher } from "./proxy-routing";

/**
 * Probe the outbound identity for a transport (direct or via a proxy URL):
 * IP, ASN/provider, ISP/org, and geo. Used to confirm a proxy actually changes
 * egress and to attribute challenge outcomes to a specific network identity.
 * Best-effort; never throws.
 */
export interface TransportIdentity {
  ok: boolean;
  ip?: string;
  asn?: string;
  isp?: string;
  org?: string;
  country?: string;
  city?: string;
  error?: string;
  latencyMs: number;
}

const IDENTITY_ENDPOINT = "http://ip-api.com/json/?fields=status,query,as,isp,org,countryCode,city";

export async function probeOutboundIdentity(proxyUrl?: string): Promise<TransportIdentity> {
  const start = Date.now();
  try {
    const { fetch: undiciFetch } = await import("undici");
    const dispatcher = proxyUrl ? await getUndiciDispatcher(proxyUrl) : undefined;
    const res = await undiciFetch(IDENTITY_ENDPOINT, {
      dispatcher,
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "ShopScoutTransportProbe/1.0" },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { ok: false, error: `http_${res.status}`, latencyMs };
    const j = (await res.json()) as {
      status?: string;
      query?: string;
      as?: string;
      isp?: string;
      org?: string;
      countryCode?: string;
      city?: string;
    };
    if (j.status !== "success") {
      return { ok: false, error: "lookup_failed", latencyMs };
    }
    return {
      ok: true,
      ip: j.query,
      asn: j.as,
      isp: j.isp,
      org: j.org,
      country: j.countryCode,
      city: j.city,
      latencyMs,
    };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 120), latencyMs: Date.now() - start };
  }
}
