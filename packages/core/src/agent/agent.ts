import type { Provider, ChatCompletionRequest, ToolSchema } from '../providers/types.js';
import type {
  Message,
  AssistantMessage,
  ToolCall,
  ModelDefinition,
  TokenUsage,
} from '../core/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { MAX_TOOL_CALL_ITERATIONS, ITERATION_WARNING_THRESHOLD } from '../core/constants.js';

// ─── Event system ────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'stream_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'stream_delta'; content: string }
  | { type: 'stream_end'; message: AssistantMessage }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_end'; toolCall: ToolCall; result: string; success: boolean; metadata?: Record<string, unknown> }
  | { type: 'usage'; usage: TokenUsage; cost?: number }
  | { type: 'error'; error: Error }
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
            content: `[WARNING] You have ${remaining} iterations remaining before the loop limit. Wrap up your current task — summarize what you've done and what's left. Don't start new multi-step work.`,
          },
        ];
      }

      // Auto-truncate to fit context window (reserve 30% for output + safety margin)
      // The 30% buffer accounts for: model output tokens, estimation inaccuracy,
      // and tool call overhead that's hard to predict.
      const maxInputTokens = Math.floor(this.model.contextWindow * 0.7);
      messages = this.truncateMessages(messages, maxInputTokens);

      // Strip reasoning_content before sending — it's an output-only field.
      // Providers like DeepSeek reject requests that include it in input messages.
      const sanitizedMessages = messages.map((m) => {
        if (m.role === 'assistant' && 'reasoning_content' in m) {
          const { reasoning_content: _, ...rest } = m as AssistantMessage;
          return rest as Message;
        }
        return m;
      });

      const request: ChatCompletionRequest = {
        model: this.model.id,
        messages: sanitizedMessages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        tool_choice: toolSchemas.length > 0 ? 'auto' : undefined,
        stream: true,
      };

      const { message: assistantMessage, promptTokens } = await this.streamResponse(request, onEvent, signal);
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
            error: new Error(
              'The model returned an empty response. This can happen when the API is overloaded or the request was filtered. Try again.',
            ),
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

        const result = await this.toolRegistry.execute(
          toolCall.function.name,
          parsedArgs,
          runContext,
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
      `Ava reached the ${MAX_TOOL_CALL_ITERATIONS}-iteration safety limit. This usually means the task is very large or the model got stuck in a loop.`,
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

    const toolCalls: ToolCall[] =
      toolCallsAccumulator.size > 0 ? Array.from(toolCallsAccumulator.values()) : [];

    const message: AssistantMessage = {
      role: 'assistant',
      content: content || null,
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

  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    // Conservative token estimation — uses length/3 (not length/4) because
    // code, JSON, and tool results tokenize at ~2.5-3 chars per token,
    // not the ~4 chars/token that English prose averages.
    const estimateTextTokens = (text: string): number => Math.ceil(text.length / 3);

    const estimateTokens = (msg: Message): number => {
      let tokens = 4; // message overhead (role, separators)

      const { content } = msg;
      if (content === null) {
        // no content
      } else if (typeof content === 'string') {
        tokens += estimateTextTokens(content);
      } else {
        for (const part of content) {
          if (part.type === 'text') tokens += estimateTextTokens(part.text);
          else if (part.type === 'image_url') tokens += 85;
        }
      }

      // Count tool calls in assistant messages (function name + JSON arguments)
      const toolCalls = (msg as unknown as Record<string, unknown>).tool_calls as
        | Array<{ function: { name: string; arguments: string } }>
        | undefined;
      if (toolCalls) {
        for (const tc of toolCalls) {
          tokens += estimateTextTokens(tc.function.name) + estimateTextTokens(tc.function.arguments) + 8;
        }
      }

      return tokens;
    };

    const total = messages.reduce((sum, m) => sum + estimateTokens(m), 0);
    if (total <= maxTokens) return messages;

    // Keep system prompt (first message) and trim from the beginning of the rest
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];
    const systemTokens = systemMsg ? estimateTokens(systemMsg) : 0;
    const budget = maxTokens - systemTokens;

    const kept: Message[] = [];
    let used = 0;

    for (let i = rest.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(rest[i]);
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
