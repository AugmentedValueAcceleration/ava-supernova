// ─── Message Types ───────────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

export type ContentPart = TextContentPart | ImageContentPart;

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface BaseMessage {
  role: MessageRole;
  content: string | ContentPart[] | null;
}

export interface SystemMessage extends BaseMessage {
  role: 'system';
  content: string;
}

export interface UserMessage extends BaseMessage {
  role: 'user';
  content: string | ContentPart[];
}

/** Extract text from string or content array. */
export function getTextContent(content: string | ContentPart[] | null): string {
  if (content === null) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is TextContentPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant';
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolMessage extends BaseMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ─── Streaming Types ─────────────────────────────────────────────────────────

export interface StreamDelta {
  role?: 'assistant';
  content?: string | null;
  /** Thinking/reasoning content (DeepSeek R1, GLM, Kimi, Mistral Magistral) */
  reasoning_content?: string | null;
  /** Alternate field name used by Kimi K2 Thinking (Together AI) */
  reasoning?: string | null;
  tool_calls?: StreamToolCallDelta[];
}

export interface StreamToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: StreamDelta;
    finish_reason: string | null;
  }>;
  usage?: TokenUsage;
}

// ─── Completion Response (non-streaming) ─────────────────────────────────────

export interface CompletionChoice {
  index: number;
  message: AssistantMessage;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;

  // ── Prompt-cache counts ──────────────────────────────────────────────
  // These are NOT new data. normalizeStreamChunk and normalizeResponse are
  // pass-through casts, so the provider's whole usage object has always
  // arrived intact at runtime — the type simply did not admit these fields,
  // so every consumer that went through it silently dropped them. That is
  // why agent.ts had to launder `usage` through `as unknown as` to reach
  // extractUsage. Declaring them is the fix; nothing new is being collected.
  //
  // Three spellings because three providers disagree, all verified against
  // their live APIs on 2026-08-15:
  //   prompt_tokens_details.cached_tokens — the portable one. Mistral
  //     reports ONLY here, so a top-level read loses every Mistral call.
  //   cached_tokens — Kimi, alongside the nested copy.
  //   prompt_cache_hit_tokens — DeepSeek's own spelling, also alongside.
  // Qwen reports no cache field at any of the three, which is a fact about
  // Qwen and not a bug here: absent must stay distinguishable from zero.
  //
  // All optional, so absent means "this provider said nothing" rather than
  // "no cache hit". Never default these to 0 on the way through — a zero
  // asserts a measurement that was never taken, and one such zero was
  // briefly cited as evidence this pipeline worked when it did not.
  cached_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface CompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: CompletionChoice[];
  usage: TokenUsage;
}

// ─── Model Definition ────────────────────────────────────────────────────────

export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsToolCalls: boolean;
  supportsStreaming: boolean;
  supportsThinking?: boolean;
  supportsVision?: boolean;
  /**
   * Desktop-automation suitability flag — IDE-only.
   *
   * Desktop mode fires many short tool calls in fast succession, each one
   * capable of clicking, typing, or launching something with real-world
   * consequences. The model must (a) format tool-call arguments reliably
   * with no field drops or hallucinated structures, (b) emit native
   * `tool_calls` (not text-format), and (c) respond fast enough that a
   * 6-step plan doesn't feel like watching paint dry.
   *
   * Set true on coordinators that have proven all three. Smaller / faster
   * models (Qwen Flash, Qwen Omni Flash) are great for chat-light turns
   * but drop tool-call args under load; they should never be the active
   * coordinator while reaching out to the user's screen. Media models
   * (MiniMax) aren't agentic coordinators at all.
   *
   * The IDE filters the desktop-mode picker on this flag and prompts the
   * operator to switch when entering desktop mode on an incompatible model.
   * Default false / omitted — opt in per model.
   */
  desktopCapable?: boolean;
  /**
   * Availability kill-switch. When true, the model is treated as if it does
   * not exist: the registry refuses to resolve it (so auto-routing skips it
   * and a saved selection silently falls back) and omits it from every model
   * listing (so it vanishes from the picker). Existing routing tables can keep
   * referencing the id — resolution just returns undefined.
   *
   * Use for models that must be pulled temporarily without deleting their
   * definition — regulatory holds, provider outages, paused rollouts. Flip
   * back to false (or remove) to re-enable instantly.
   */
  disabled?: boolean;
  /**
   * Picker-only hide. When true, the model is omitted from the user-facing
   * model dropdown but stays FULLY resolvable — unlike `disabled`, routing
   * tables and fallback chains can still use it. Use to retire a superseded
   * model from the catalogue the user sees (newer version exists) while it
   * keeps serving as an internal fallback or intent-gate. See getModelList.
   */
  hiddenFromPicker?: boolean;
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}
