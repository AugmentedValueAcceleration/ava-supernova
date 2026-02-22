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
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}
