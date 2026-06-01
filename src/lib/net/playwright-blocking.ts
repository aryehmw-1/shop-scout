export const BLOCKED_RESOURCE_TYPES = new Set([
  "image",
  "media",
  "font",
]);

export const BLOCKED_URL_PATTERNS = [
  /google-analytics|googletagmanager|doubleclick|segment|hotjar|sentry|newrelic|datadog|facebook\.net|pixel/i,
  /\/(analytics|tracking|tracker|metrics|beacon)\b/i,
  /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|mp3|webm)(\?|$)/i,
];

export async function installBandwidthBlocking(page: {
  route: (pattern: string, handler: (route: any, request: any) => Promise<void> | void) => Promise<void>;
}) {
  await page.route("**/*", async (route, request) => {
    const type = request.resourceType();
    const url = request.url();
    if (BLOCKED_RESOURCE_TYPES.has(type)) {
      await route.abort();
      return;
    }
    if (BLOCKED_URL_PATTERNS.some((re) => re.test(url))) {
      await route.abort();
      return;
    }
    await route.continue();
  });
}
