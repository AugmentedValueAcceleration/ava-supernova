import type { Message, ModelDefinition, CompletionResponse, StreamChunk } from '../core/types.js';

// ─── Tool Schema (sent to LLM) ──────────────────────────────────────────────

export interface FunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolSchema {
  type: 'function';
  function: FunctionSchema;
}

// ─── Provider Request ────────────────────────────────────────────────────────

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  tools?: ToolSchema[];
  tool_choice?: 'auto' | 'none' | 'required';
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  top_p?: number;
  stop?: string | string[];
}

// ─── Provider Configuration ──────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface Provider {
  readonly name: string;
  readonly displayName: string;

  listModels(): ModelDefinition[];

  createCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;

  /** Optional — embed a single text via an OpenAI-compatible `/embeddings`
   *  endpoint. Only providers that actually have one (e.g. local Ollama, used
   *  for semantic memory recall) support it; callers degrade gracefully. */
  createEmbedding?(text: string, model: string, signal?: AbortSignal): Promise<number[]>;

  createStreamingCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, unknown>;
}
