/** Client helper: send a product photo to the vision endpoint and get back a
 *  shopping search query. Returns { query } on success or { error } on failure. */
export async function identifyProductImage(
  file: File,
): Promise<{ query?: string; error?: string }> {
  if (!file.type.startsWith("image/")) {
    return { error: "Please choose an image file." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: "That image is too large (max 8 MB)." };
  }

  const body = new FormData();
  body.append("image", file);

  try {
    const res = await fetch("/api/vision/identify", { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as {
      query?: string;
      error?: string;
    };
    if (!res.ok || !data.query) {
      return { error: data.error ?? "Couldn't read that photo." };
    }
    return { query: data.query };
  } catch {
    return { error: "Network error — please try again." };
  }
}
