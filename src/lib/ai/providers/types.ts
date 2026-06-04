/** Provider-agnostic AI surface — no business logic here. */

export type AIProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "bedrock"
  | "vertex"
  | "local";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface GenerateResult {
  text: string;
  provider: AIProviderId;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface EmbedOptions {
  model?: string;
}

export interface EmbedResult {
  vector: number[];
  provider: AIProviderId;
  model: string;
  latencyMs: number;
}

export interface ClassifyOptions {
  labels: string[];
  model?: string;
}

export interface ClassifyResult {
  label: string;
  confidence: number;
  provider: AIProviderId;
  latencyMs: number;
}

export interface AIProvider {
  id: AIProviderId;
  isAvailable(): boolean;
  generate(messages: AIMessage[], options?: GenerateOptions): Promise<GenerateResult | null>;
  stream?(
    messages: AIMessage[],
    options?: GenerateOptions,
  ): AsyncIterable<string>;
  embed?(text: string, options?: EmbedOptions): Promise<EmbedResult | null>;
  classify?(text: string, options: ClassifyOptions): Promise<ClassifyResult | null>;
}
