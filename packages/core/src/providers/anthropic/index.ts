import type { ChatCompletionRequest } from '../types.js';
import type {
  ModelDefinition,
  CompletionResponse,
  StreamChunk,
  ContentPart,
  ToolCall,
} from '../../core/types.js';
import { BaseProvider } from '../base-provider.js';
import { ProviderError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { ANTHROPIC_MODELS } from './models.js';

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic (Claude) provider.
 *
 * Claude uses a fundamentally different API from the OpenAI-compatible format
 * used by all other providers. We override createCompletion and
 * createStreamingCompletion to handle the conversion at both ends.
 */
export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic';

  protected getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com';
  }

  protected getCompletionUrl(): string {
    return `${this.baseUrl}/v1/messages`;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  listModels(): ModelDefinition[] {
    return ANTHROPIC_MODELS;
  }

  // ── Non-streaming completion ───────────────────────────────────────────

  async createCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<CompletionResponse> {
    const anthropicBody = this.toAnthropicRequest(request, false);

    const url = this.getCompletionUrl();
    const headers = this.getAuthHeaders();

    logger.debug(`[anthropic] POST ${url} | model=${request.model}`);

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(anthropicBody),
      signal,
    });

    const data = await response.json() as Record<string, unknown>;
    return this.fromAnthropicResponse(data, request.model);
  }

  // ── Streaming completion ───────────────────────────────────────────────

  async *createStreamingCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const anthropicBody = this.toAnthropicRequest(request, true);

    const url = this.getCompletionUrl();
    const headers = this.getAuthHeaders();

    logger.debug(`[anthropic] POST ${url} (stream) | model=${request.model}`);

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(anthropicBody),
      signal,
    });

    if (!response.body) {
      throw new ProviderError('No response body for streaming', this.name);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        if (signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          // Track usage
          if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens || 0;
          }
          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens || 0;
          }

          const chunk = this.convertStreamEvent(event, request.model, inputTokens, outputTokens);
          if (chunk) yield chunk;
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* already closed */ }
      reader.releaseLock();
    }
  }

  // ── Request conversion: OpenAI → Anthropic ─────────────────────────────

  private toAnthropicRequest(
    request: ChatCompletionRequest,
    stream: boolean,
  ): Record<string, unknown> {
    let systemPrompt: string | undefined;
    const messages: unknown[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemPrompt = (systemPrompt ? systemPrompt + '\n\n' : '') + (msg.content as string);
        continue;
      }

      if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
        const content: unknown[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: safeParse(tc.function.arguments),
          });
        }
        messages.push({ role: 'assistant', content });
        continue;
      }

      if (msg.role === 'tool') {
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: (msg as { tool_call_id: string }).tool_call_id,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          }],
        });
        continue;
      }

      // User and assistant messages
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const parts = (msg.content as ContentPart[]).map(part => {
          if (part.type === 'text') return { type: 'text', text: part.text };
          if (part.type === 'image_url') {
            const url = part.image_url.url;
            if (url.startsWith('data:')) {
              const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
              }
            }
            return { type: 'image', source: { type: 'url', url } };
          }
          return { type: 'text', text: '' };
        });
        messages.push({ role: msg.role, content: parts });
      } else {
        messages.push({ role: msg.role, content: msg.content || '' });
      }
    }

    // Convert tools
    const tools = request.tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters || { type: 'object', properties: {} },
    }));

    // Convert tool_choice
    let toolChoice: unknown;
    if (request.tool_choice === 'auto') toolChoice = { type: 'auto' };
    else if (request.tool_choice === 'none') toolChoice = { type: 'none' };
    else if (request.tool_choice === 'required') toolChoice = { type: 'any' };

    return {
      model: request.model,
      messages,
      max_tokens: request.max_tokens || 4096,
      ...(systemPrompt && { system: systemPrompt }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.top_p !== undefined && { top_p: request.top_p }),
      ...(request.stop && { stop_sequences: Array.isArray(request.stop) ? request.stop : [request.stop] }),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      ...(stream ? { stream: true } : {}),
    };
  }

  // ── Response conversion: Anthropic → OpenAI ────────────────────────────

  private fromAnthropicResponse(
    data: Record<string, unknown>,
    model: string,
  ): CompletionResponse {
    const content = data.content as Array<{
      type: string; text?: string; id?: string; name?: string; input?: unknown;
    }>;

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') textContent += block.text || '';
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id!,
            type: 'function',
            function: {
              name: block.name!,
              arguments: JSON.stringify(block.input || {}),
            },
          });
        }
      }
    }

    const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const stopReason = data.stop_reason as string;

    return {
      id: (data.id as string) || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: textContent || null,
          ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
        },
        finish_reason: stopReason === 'tool_use' ? 'tool_calls'
          : stopReason === 'max_tokens' ? 'length'
          : 'stop',
      }],
      usage: {
        prompt_tokens: usage?.input_tokens || 0,
        completion_tokens: usage?.output_tokens || 0,
        total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      },
    };
  }

  // ── Stream event conversion ────────────────────────────────────────────

  private convertStreamEvent(
    event: Record<string, unknown>,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): StreamChunk | null {
    const type = event.type as string;
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    if (type === 'content_block_start') {
      const block = event.content_block as { type: string; id?: string; name?: string };
      if (block?.type === 'text') {
        return {
          id, object: 'chat.completion.chunk', created, model,
          choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
        };
      }
      if (block?.type === 'tool_use') {
        return {
          id, object: 'chat.completion.chunk', created, model,
          choices: [{
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: [{
                index: event.index as number,
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        };
      }
    }

    if (type === 'content_block_delta') {
      const delta = event.delta as { type: string; text?: string; partial_json?: string };
      if (delta?.type === 'text_delta') {
        return {
          id, object: 'chat.completion.chunk', created, model,
          choices: [{ index: 0, delta: { content: delta.text || '' }, finish_reason: null }],
        };
      }
      if (delta?.type === 'input_json_delta') {
        return {
          id, object: 'chat.completion.chunk', created, model,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: event.index as number,
                function: { arguments: delta.partial_json || '' },
              }],
            },
            finish_reason: null,
          }],
        };
      }
    }

    if (type === 'message_delta') {
      const stopReason = (event.delta as { stop_reason?: string })?.stop_reason;
      return {
        id, object: 'chat.completion.chunk', created, model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: stopReason === 'tool_use' ? 'tool_calls' : 'stop',
        }],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      };
    }

    return null;
  }

}

function safeParse(str: string): unknown {
  try { return JSON.parse(str); } catch { return {}; }
}
