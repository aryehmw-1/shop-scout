import { anthropicProvider } from "./anthropic-provider";
import { geminiProvider } from "./gemini-provider";
import { openaiProvider } from "./openai-provider";
import { openrouterProvider } from "./openrouter-provider";
import { bedrockProvider, localProvider, vertexProvider } from "./stub-providers";
import type { AIProvider, AIProviderId } from "./types";

const PROVIDERS: AIProvider[] = [
  openaiProvider,
  anthropicProvider,
  geminiProvider,
  openrouterProvider,
  bedrockProvider,
  vertexProvider,
  localProvider,
];

export function getProvider(id: AIProviderId): AIProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function listAvailableProviders(): AIProviderId[] {
  return PROVIDERS.filter((p) => p.isAvailable()).map((p) => p.id);
}

export function getDefaultProvider(): AIProvider | null {
  const preferred = (process.env.AI_DEFAULT_PROVIDER ?? "openai") as AIProviderId;
  const p = getProvider(preferred);
  if (p?.isAvailable()) return p;
  return PROVIDERS.find((x) => x.isAvailable()) ?? null;
}
