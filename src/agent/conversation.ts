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
}
