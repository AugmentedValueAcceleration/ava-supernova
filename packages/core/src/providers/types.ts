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
  /**
   * Opt out of a hybrid model's reasoning pass.
   *
   * Several models we serve think by DEFAULT — Qwen 3.5 Flash and 3.7 Flash
   * both do, despite 3.5 Flash carrying supportsThinking: false in our
   * catalogue. Reasoning tokens bill as output and are generated before any
   * answer appears, so on a classification the cost is entirely wasted:
   * measured against the intent gate's own parameters, thinking produced 601
   * output tokens where the same correct answer took 9.
   *
   * Note it is NOT bounded by max_tokens — the gate caps at 120 and still saw
   * 601, because the reasoning pass is not charged against that budget.
   *
   * Leave undefined for anything that benefits from reasoning. Set false for
   * classifiers, routers and gates, where latency ahead of the real work
   * matters more than depth.
   */
  enable_thinking?: boolean;

  /**
   * Provider-specific chat-template arguments. Currently only NVIDIA NIM,
   * where `{ thinking: false }` is the ONLY thing that stops a Nemotron model
   * reasoning — `enable_thinking` does nothing there, and the documented
   * "detailed thinking off" system directive was measured to have no effect
   * either (2026-08-16).
   *
   * This is not a tuning knob. Nemotron 3.5 Lightning left to its default
   * writes its scratchpad INTO THE CONTENT — not into reasoning_content where
   * it could be stripped — so an ordinary question came back as 300 tokens of
   * "Here's a thinking process: 1. **Analyze User Input:**" after 14 seconds,
   * having never answered. The same question with this set: 54 tokens, 0.67s,
   * a clean answer. supportsThinking on the model definition does not help;
   * that flag only governs whether we replay reasoning_content next turn.
   *
   * Kept generic rather than named for Nemotron because the underlying thing
   * is a vLLM/NIM convention, and the next provider on that stack will want
   * the same door.
   */
  chat_template_kwargs?: Record<string, unknown>;
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
