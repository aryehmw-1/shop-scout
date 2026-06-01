/**
 * Parse HAR embed content for failed requests and PerimeterX-related calls.
 */
export interface HarSummary {
  failedRequests: Array<{ url: string; failure?: string }>;
  blockedUrls: string[];
  pxUrls: string[];
  documentCount: number;
  totalEntries: number;
}

const PX_RE = /perimeterx|px-cdn|px-cloud|pxchk|px\.|captcha/i;

export function parseHarSummary(harJson: string): HarSummary {
  const out: HarSummary = {
    failedRequests: [],
    blockedUrls: [],
    pxUrls: [],
    documentCount: 0,
    totalEntries: 0,
  };
  try {
    const har = JSON.parse(harJson) as {
      log?: {
        entries?: Array<{
          request?: { url?: string };
          response?: { status?: number };
          _failureText?: string;
        }>;
      };
    };
    const entries = har.log?.entries ?? [];
    out.totalEntries = entries.length;
    for (const e of entries) {
      const url = e.request?.url ?? "";
      const status = e.response?.status ?? 0;
      if (status === 0 || e._failureText) {
        out.failedRequests.push({ url: url.slice(0, 200), failure: e._failureText ?? "status_0" });
        if (/ERR_|blocked|aborted/i.test(e._failureText ?? "")) {
          out.blockedUrls.push(url.slice(0, 120));
        }
      }
      if (PX_RE.test(url)) {
        out.pxUrls.push(url.slice(0, 200));
      }
      if (status >= 400 && status < 600) {
        out.blockedUrls.push(`${status}:${url.slice(0, 100)}`);
      }
    }
  } catch {
    /* invalid har */
  }
  return out;
}
