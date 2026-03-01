import type { Provider, ChatCompletionRequest, ToolSchema } from '../providers/types.js';
import type {
  Message,
  AssistantMessage,
  ToolCall,
  ModelDefinition,
  TokenUsage,
  ContentPart,
} from '../core/types.js';
import { getTextContent } from '../core/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { MAX_TOOL_CALL_ITERATIONS, ITERATION_WARNING_THRESHOLD } from '../core/constants.js';
import { t } from '../i18n/index.js';

// ─── Event system ────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'stream_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end'; message: AssistantMessage }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_partial'; toolCallId: string; data: string }
  | { type: 'tool_call_end'; toolCall: ToolCall; result: string; success: boolean; metadata?: Record<string, unknown> }
  | { type: 'usage'; usage: TokenUsage; cost?: number }
  | { type: 'error'; error: Error }
  | { type: 'context_truncated'; droppedCount: number }
  | { type: 'context_compression_start' }
  | { type: 'context_compression_end'; originalTokens: number; compressedTokens: number }
  | { type: 'done'; finalMessage: AssistantMessage };

export type AgentEventHandler = (event: AgentEvent) => void;

// ─── Agent ───────────────────────────────────────────────────────────────────

export class Agent {
  private readonly provider: Provider;
  private readonly model: ModelDefinition;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolExecutionContext;

  constructor(opts: {
    provider: Provider;
    model: ModelDefinition;
    toolRegistry: ToolRegistry;
    cwd: string;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.toolRegistry = opts.toolRegistry;
    this.toolContext = { cwd: opts.cwd };
  }

  async run(messages: Message[], onEvent: AgentEventHandler, signal?: AbortSignal): Promise<Message[]> {
    const toolSchemas: ToolSchema[] = this.model.supportsToolCalls
      ? this.toolRegistry.getSchemas()
      : [];

    // Pass signal to tool execution context so tools (esp. bash) can be cancelled
    const runContext = { ...this.toolContext, signal };

    let iterations = 0;
    let warningInjected = false;

    while (iterations < MAX_TOOL_CALL_ITERATIONS) {
      // Check for cancellation before each iteration
      if (signal?.aborted) {
        onEvent({ type: 'done', finalMessage: { role: 'assistant', content: null } });
        return messages;
      }

      iterations++;

      // Warn the model when approaching the iteration limit
      const remaining = MAX_TOOL_CALL_ITERATIONS - iterations;
      if (!warningInjected && remaining <= ITERATION_WARNING_THRESHOLD) {
        warningInjected = true;
        messages = [
          ...messages,
          {
            role: 'system' as const,
            content: t('error.msg.iteration_warning', { remaining: String(remaining) }),
          },
        ];
      }

      // Auto-truncate to fit context window (reserve 30% for output + safety margin)
      // The 30% buffer accounts for: model output tokens, estimation inaccuracy,
      // and tool call overhead that's hard to predict.
      const maxInputTokens = Math.floor(this.model.contextWindow * 0.7);
      const estimatedTotal = this.estimateTokenCount(messages);

      // Try smart compression before dumb truncation (only if enough messages to summarize)
      if (estimatedTotal > maxInputTokens && messages.length >= 8) {
        messages = await this.compressContext(messages, onEvent, signal);
      }

      // Still over budget? Fall back to dumb truncation
      const preCount = messages.length;
      messages = this.truncateMessages(messages, maxInputTokens);
      const dropped = preCount - messages.length;
      if (dropped > 0) {
        onEvent({ type: 'context_truncated', droppedCount: dropped });
      }

      // ── Sanitize messages for model compatibility ──────────────────────────
      const sanitizedMessages = messages.map((m) => {
        let msg = m;

        // Strip image_url parts for non-vision models (DeepSeek, Mistral, etc.)
        // The image stays in local history so vision-capable models can still see it.
        if (!this.model.supportsVision && Array.isArray(msg.content)) {
          const textParts = (msg.content as ContentPart[]).filter((p) => p.type === 'text');
          if (textParts.length === 0) {
            // Message was image-only — replace with a note so the model has context
            msg = { ...msg, content: t('error.msg.image_stripped') };
          } else if (textParts.length < (msg.content as ContentPart[]).length) {
            // Mixed text+image — keep only the text, collapsed to a plain string
            msg = { ...msg, content: textParts.map((p) => p.text).join('\n') };
          }
        }

        // Handle reasoning_content based on model capability:
        // - Thinking models (DeepSeek Reasoner, etc.): KEEP — required for multi-turn
        // - Non-thinking models: STRIP — providers reject it as input
        if (msg.role === 'assistant' && 'reasoning_content' in msg) {
          const aMsg = msg as AssistantMessage;
          if (this.model.supportsThinking) {
            if (aMsg.reasoning_content && !aMsg.content) {
              return { ...aMsg, content: '' } as Message;
            }
            return msg;
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { reasoning_content: _rc, ...rest } = aMsg;
          return rest as Message;
        }

        return msg;
      });

      const request: ChatCompletionRequest = {
        model: this.model.id,
        messages: sanitizedMessages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        tool_choice: toolSchemas.length > 0 ? 'auto' : undefined,
        stream: true,
      };

      let assistantMessage: AssistantMessage;
      let promptTokens: number;
      try {
        ({ message: assistantMessage, promptTokens } = await this.streamResponse(request, onEvent, signal));
      } catch (error) {
        // Surface the error through the event system so CLI/extension handle it consistently
        onEvent({ type: 'error', error: error instanceof Error ? error : new Error(String(error)) });
        return messages;
      }
      messages = [...messages, assistantMessage];

      // If the actual token count was dangerously high, force aggressive truncation
      // before the next iteration. Our estimation may have been too low.
      if (promptTokens > 0 && promptTokens > this.model.contextWindow * 0.65) {
        const targetTokens = Math.floor(this.model.contextWindow * 0.5);
        messages = this.truncateMessages(messages, targetTokens);
      }

      // If cancelled during streaming, stop immediately
      if (signal?.aborted) {
        onEvent({ type: 'done', finalMessage: assistantMessage });
        return messages;
      }

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        // Surface empty responses — model returned nothing visible to the user
        if (!assistantMessage.content && !assistantMessage.reasoning_content) {
          onEvent({
            type: 'error',
            error: new Error(t('error.msg.empty_response')),
          });
        }
        onEvent({ type: 'done', finalMessage: assistantMessage });
        return messages;
      }

      for (const toolCall of assistantMessage.tool_calls) {
        // Check for cancellation before each tool call
        if (signal?.aborted) {
          onEvent({ type: 'done', finalMessage: assistantMessage });
          return messages;
        }

        onEvent({ type: 'tool_call_start', toolCall });

        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          parsedArgs = {};
        }

        const toolRunContext = {
          ...runContext,
          onOutput: (data: string) => {
            onEvent({ type: 'tool_call_partial', toolCallId: toolCall.id, data });
          },
        };

        const result = await this.toolRegistry.execute(
          toolCall.function.name,
          parsedArgs,
          toolRunContext,
        );

        onEvent({
          type: 'tool_call_end',
          toolCall,
          result: result.output,
          success: result.success,
          metadata: result.metadata,
        });

        messages = [
          ...messages,
          {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: result.output,
          },
        ];
      }
    }

    const iterError = new Error(
      t('error.msg.iteration_limit', { limit: String(MAX_TOOL_CALL_ITERATIONS) }),
    );
    (iterError as Error & { code?: string }).code = 'iterations_exceeded';
    onEvent({ type: 'error', error: iterError });
    return messages;
  }

  private async streamResponse(
    request: ChatCompletionRequest,
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<{ message: AssistantMessage; promptTokens: number }> {
    onEvent({ type: 'stream_start' });

    let content = '';
    let reasoningContent = '';
    let usage: TokenUsage | undefined;
    const toolCallsAccumulator = new Map<
      number,
      {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }
    >();

    try {
      for await (const chunk of this.provider.createStreamingCompletion(request, signal)) {
        if (chunk.usage) {
          usage = chunk.usage;
        }

        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Thinking/reasoning content (DeepSeek R1, GLM, Kimi, Mistral Magistral)
        const thinking = delta.reasoning_content ?? delta.reasoning;
        if (thinking) {
          reasoningContent += thinking;
          onEvent({ type: 'thinking_delta', content: thinking });
        }

        if (delta.content) {
          content += delta.content;
          onEvent({ type: 'stream_delta', content: delta.content });
        }

        if (delta.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            if (!toolCallsAccumulator.has(tcDelta.index)) {
              toolCallsAccumulator.set(tcDelta.index, {
                id: tcDelta.id ?? '',
                type: 'function',
                function: { name: '', arguments: '' },
              });
            }
            const acc = toolCallsAccumulator.get(tcDelta.index)!;
            if (tcDelta.id) acc.id = tcDelta.id;
            if (tcDelta.function?.name) acc.function.name += tcDelta.function.name;
            if (tcDelta.function?.arguments) acc.function.arguments += tcDelta.function.arguments;
          }
        }
      }
    } catch (error) {
      // Preserve partial content if we collected any before the error
      if (content || reasoningContent) {
        const partialMessage: AssistantMessage = {
          role: 'assistant',
          content: content || null,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
        };
        onEvent({ type: 'stream_end', message: partialMessage });
      }
      throw error;
    }

    const toolCalls: ToolCall[] =
      toolCallsAccumulator.size > 0 ? Array.from(toolCallsAccumulator.values()) : [];

    // DeepSeek Reasoner rule: "If reasoning_content is set, content must not be empty."
    // When the model returns reasoning + tool_calls but no text, content would be null —
    // which causes a 400 on the next request if reasoning_content is also present.
    const finalContent = (!content && reasoningContent) ? '' : (content || null);

    const message: AssistantMessage = {
      role: 'assistant',
      content: finalContent,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };

    onEvent({ type: 'stream_end', message });

    if (usage) {
      let cost: number | undefined;
      if (this.model.pricing) {
        cost =
          (usage.prompt_tokens / 1_000_000) * this.model.pricing.inputPerMillion +
          (usage.completion_tokens / 1_000_000) * this.model.pricing.outputPerMillion;
      }
      onEvent({ type: 'usage', usage, cost });
    }

    return { message, promptTokens: usage?.prompt_tokens ?? 0 };
  }

  // ── Context compression ──────────────────────────────────────────────────

  /**
   * Compress conversation context by summarizing older messages.
   * Keeps the system prompt and last 4 messages (2 user-assistant exchanges)
   * verbatim, summarizes everything in between using the model.
   * Falls back silently if the compression API call fails.
   */
  async compressContext(
    messages: Message[],
    onEvent: AgentEventHandler,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    onEvent({ type: 'context_compression_start' });

    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];

    // Keep last 4 messages verbatim (2 exchange pairs)
    const KEEP_RECENT = 4;
    if (rest.length <= KEEP_RECENT) {
      onEvent({ type: 'context_compression_end', originalTokens: 0, compressedTokens: 0 });
      return messages;
    }

    const toCompress = rest.slice(0, -KEEP_RECENT);
    const toKeep = rest.slice(-KEEP_RECENT);

    // Build the text to summarize (extract text content, skip raw tool JSON)
    const transcript = toCompress
      .map((m) => {
        const text = getTextContent(m.content);
        return `[${m.role}]: ${text || '(no text)'}`;
      })
      .join('\n');

    const compressionPrompt = `You are a conversation summarizer. Summarize this conversation transcript concisely while preserving:
- Key decisions and conclusions reached
- File paths, function names, and code identifiers mentioned
- Current task state and what was accomplished
- Any errors encountered and how they were resolved
- Important technical context the assistant will need going forward

Be concise but thorough. Use bullet points. Do NOT include pleasantries or meta-commentary.

TRANSCRIPT:
${transcript}`;

    try {
      const response = await this.provider.createCompletion(
        {
          model: this.model.id,
          messages: [
            { role: 'system', content: 'You are a precise conversation summarizer.' },
            { role: 'user', content: compressionPrompt },
          ],
          max_tokens: 1500,
          temperature: 0.2,
        },
        signal,
      );

      const summary = response.choices?.[0]?.message?.content || '';
      if (!summary) throw new Error('Empty compression response');

      const summaryMessage: Message = {
        role: 'user',
        content: `[Context Summary — earlier conversation compressed]\n\n${summary}`,
      };

      const fixedTail = this.fixToolPairing(toKeep);
      const result = systemMsg
        ? [systemMsg, summaryMessage, ...fixedTail]
        : [summaryMessage, ...fixedTail];

      const originalTokens = this.estimateTokenCount(messages);
      const compressedTokens = this.estimateTokenCount(result);
      onEvent({ type: 'context_compression_end', originalTokens, compressedTokens });

      return result;
    } catch {
      // Compression failed — fall back silently (caller will truncate if needed)
      onEvent({ type: 'context_compression_end', originalTokens: 0, compressedTokens: 0 });
      return messages;
    }
  }

  // ── Token estimation ──────────────────────────────────────────────────────

  private static estimateTextTokens(text: string): number {
    // Conservative: uses length/3 (not length/4) because code, JSON, and
    // tool results tokenize at ~2.5-3 chars per token.
    return Math.ceil(text.length / 3);
  }

  private estimateMessageTokens(msg: Message): number {
    let tokens = 4; // message overhead (role, separators)

    const { content } = msg;
    if (content === null) {
      // no content
    } else if (typeof content === 'string') {
      tokens += Agent.estimateTextTokens(content);
    } else {
      for (const part of content) {
        if (part.type === 'text') tokens += Agent.estimateTextTokens(part.text);
        else if (part.type === 'image_url') tokens += 85;
      }
    }

    // Count tool calls in assistant messages (function name + JSON arguments)
    const toolCalls = (msg as unknown as Record<string, unknown>).tool_calls as
      | Array<{ function: { name: string; arguments: string } }>
      | undefined;
    if (toolCalls) {
      for (const tc of toolCalls) {
        tokens += Agent.estimateTextTokens(tc.function.name) + Agent.estimateTextTokens(tc.function.arguments) + 8;
      }
    }

    return tokens;
  }

  /** Estimate total token count across an array of messages. */
  estimateTokenCount(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  // ── Truncation ──────────────────────────────────────────────────────────

  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    const total = messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
    if (total <= maxTokens) return messages;

    // Keep system prompt (first message) and trim from the beginning of the rest
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];
    const systemTokens = systemMsg ? this.estimateMessageTokens(systemMsg) : 0;
    const budget = maxTokens - systemTokens;

    const kept: Message[] = [];
    let used = 0;

    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateMessageTokens(rest[i]);
      if (used + msgTokens > budget) break;
      kept.unshift(rest[i]);
      used += msgTokens;
    }

    // Fix orphaned tool messages — if truncation cut in the middle of a
    // tool call/result sequence, the kept list may start with `tool` messages
    // that reference a dropped assistant message. The API rejects these.
    // Also drop any assistant messages whose tool_calls lost their results.
    const fixed = this.fixToolPairing(kept);

    return systemMsg ? [systemMsg, ...fixed] : fixed;
  }

  /**
   * Ensure every `tool` message has a preceding `assistant` with a matching
   * `tool_calls` entry, and every `assistant` with `tool_calls` has all its
   * `tool` results following it. Drops orphans from the front.
   */
  private fixToolPairing(messages: Message[]): Message[] {
    // 1. Drop leading orphaned tool messages (their assistant parent was truncated)
    let start = 0;
    while (start < messages.length && messages[start].role === 'tool') {
      start++;
    }

    if (start === messages.length) return [];
    const trimmed = start > 0 ? messages.slice(start) : messages;

    // 2. Check the first message — if it's an assistant with tool_calls,
    //    verify all its tool results are present
    const first = trimmed[0];
    if (first.role === 'assistant') {
      const toolCalls = (first as AssistantMessage).tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const expectedIds = new Set(toolCalls.map((tc) => tc.id));
        // Collect tool_call_ids from the immediately following tool messages
        let j = 1;
        while (j < trimmed.length && trimmed[j].role === 'tool') {
          const toolMsg = trimmed[j] as { tool_call_id?: string };
          expectedIds.delete(toolMsg.tool_call_id ?? '');
          j++;
        }
        // If any tool results are missing, drop this assistant + its partial results
        if (expectedIds.size > 0) {
          return trimmed.slice(j);
        }
      }
    }

    return trimmed;
  }
}
