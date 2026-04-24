import { randomUUID } from 'node:crypto';
import type { Message, ContentPart } from '../core/types.js';

export class Conversation {
  private messages: Message[] = [];
  private _id: string;

  constructor(id?: string) {
    this._id = id ?? randomUUID();
  }

  get id(): string {
    return this._id;
  }

  setSystemPrompt(content: string): void {
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0] = { role: 'system', content };
    } else {
      this.messages.unshift({ role: 'system', content });
    }
  }

  addUserMessage(content: string | ContentPart[]): void {
    this.messages.push({ role: 'user', content });
  }

  setMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  /**
   * Append new messages to the conversation in order. This is the
   * canonical way to consume Agent.run's return value — the agent
   * produces the messages a single turn generated (assistant replies,
   * tool results, interjections) and the caller appends them to the
   * conversation it owns. setMessages is kept for full-replace paths
   * (loading a conversation from disk, clearing, stop-marker injection),
   * but append is the default for the run-agent loop.
   */
  appendMessages(messages: Message[]): void {
    if (messages.length === 0) return;
    this.messages.push(...messages);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    const systemMsg = this.messages.find((m) => m.role === 'system');
    this.messages = systemMsg ? [systemMsg] : [];
  }

  truncateToFit(maxTokens: number): boolean {
    const estimatedTokens = this.estimateTokenCount();
    if (estimatedTokens <= maxTokens) return false;

    const systemMsg = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    const rest = systemMsg ? this.messages.slice(1) : [...this.messages];

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

    this.messages = systemMsg ? [systemMsg, ...kept] : kept;
    return true;
  }

  estimateTokenCount(): number {
    return this.messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  private estimateMessageTokens(message: Message): number {
    const { content } = message;
    if (content === null) return 4;
    // Use /3 divisor aligned with agent.ts estimation to avoid context window divergence
    if (typeof content === 'string') return Math.ceil(content.length / 3) + 4;
    // Content array — sum text tokens + ~85 tokens per image
    return content.reduce((sum, part) => {
      if (part.type === 'text') return sum + Math.ceil(part.text.length / 3);
      if (part.type === 'image_url') return sum + 85;
      return sum;
    }, 0) + 4;
  }
}
