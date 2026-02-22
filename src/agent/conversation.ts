import { randomUUID } from 'node:crypto';
import type { Message } from '../core/types.js';

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

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  setMessages(messages: Message[]): void {
    this.messages = [...messages];
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

    // Keep messages from the end until we run out of budget
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
    const content = message.content ?? '';
    // ~4 chars per token is a reasonable approximation
    return Math.ceil(content.length / 4) + 4; // +4 for role/metadata overhead
  }
}
