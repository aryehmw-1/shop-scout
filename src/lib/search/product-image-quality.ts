const TRUSTED_IMAGE_HOST =
  /images\.unsplash\.com|unsplash\.com|gstatic\.com|googleusercontent\.com|ggpht\.com|serpapi\.com|wikimedia\.org|openfoodfacts\.org|staticflickr\.com/i;

/** True when we should try a web image lookup instead of this URL. */
export function isWeakProductImage(url: string | undefined): boolean {
  if (!url?.startsWith("https://")) return true;
  const u = url.toLowerCase();
  if (u.includes("placehold.co")) return true;
  if (u.includes("via.placeholder")) return true;
  if (TRUSTED_IMAGE_HOST.test(u)) return false;
  return false;
}
