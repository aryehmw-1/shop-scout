import { NextRequest, NextResponse } from "next/server";
import { identifyProductFromImage, isGeminiConfigured } from "@/lib/ai/gemini";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Accept a product photo (multipart form-data, field "image") and return a
 *  shopping search query identified from it via Gemini vision. */
export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "Image recognition is unavailable right now." },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image provided." }, { status: 400 });
    }

    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPG, PNG, or WebP." },
        { status: 415 },
      );
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be between 1 byte and 8 MB." },
        { status: 413 },
      );
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const query = await identifyProductFromImage(base64, mimeType);

    if (!query) {
      return NextResponse.json(
        { error: "Couldn't recognize a product in that photo. Try a clearer shot." },
        { status: 422 },
      );
    }

    return NextResponse.json({ query });
  } catch (err) {
    console.error("[vision/identify] error:", err);
    return NextResponse.json({ error: "Failed to read the image." }, { status: 500 });
  }
}
