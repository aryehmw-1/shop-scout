const DIRECT_OK_HOST =
  /placehold\.co|images\.unsplash\.com|unsplash\.com|gstatic\.com|googleusercontent\.com|ggpht\.com|serpapi\.com|openfoodfacts\.org|staticflickr\.com/i;

/** Placeholders and trusted CDNs load directly; others go through proxy. */
export function shouldProxyImage(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  if (DIRECT_OK_HOST.test(url)) return false;
  return true;
}

export function proxiedImageUrl(url: string): string {
  if (!shouldProxyImage(url)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
