import type { SemanticEmbeddingRecord } from "./types";

/**
 * AI-ready semantic layer stub.
 * Wire to OpenAI / local model when `SEMANTIC_EMBEDDINGS=1`.
 */
export async function generateProductEmbedding(
  text: string,
): Promise<SemanticEmbeddingRecord | null> {
  if (process.env.SEMANTIC_EMBEDDINGS !== "1") return null;
  const fingerprint = text.trim().toLowerCase().slice(0, 512);
  if (!fingerprint) return null;

  // Placeholder: deterministic tiny vector for schema/testing only.
  const vector = Array.from({ length: 8 }, (_, i) => {
    const c = fingerprint.charCodeAt(i % fingerprint.length) ?? 0;
    return (c % 100) / 100;
  });

  return {
    model: "stub-v1",
    dimensions: vector.length,
    vector,
    textFingerprint: fingerprint,
    updatedAt: new Date().toISOString(),
  };
}

export function embeddingToJson(record: SemanticEmbeddingRecord | null): string | null {
  return record ? JSON.stringify(record) : null;
}
