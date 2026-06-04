import type { AIProvider, AIProviderId } from "./types";

function stubProvider(id: AIProviderId): AIProvider {
  return {
    id,
    isAvailable: () => false,
    async generate() {
      return null;
    },
  };
}

export const bedrockProvider = stubProvider("bedrock");
export const vertexProvider = stubProvider("vertex");
export const localProvider = stubProvider("local");
