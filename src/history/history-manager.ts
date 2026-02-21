import type { Conversation } from '../agent/conversation.js';
import { HistoryStorage, type ConversationRecord } from './storage.js';

export class HistoryManager {
  private storage: HistoryStorage;

  constructor() {
    this.storage = new HistoryStorage();
  }

  async init(): Promise<void> {
    await this.storage.init();
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const messages = conversation.getMessages();
    if (messages.length <= 1) return; // don't save empty conversations (system prompt only)

    const firstUserMsg = messages.find((m) => m.role === 'user');
    const title = firstUserMsg
      ? (firstUserMsg.content?.slice(0, 80) ?? 'Untitled')
      : 'Untitled';

    const record: ConversationRecord = {
      id: conversation.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title,
      messages,
    };

    await this.storage.save(record);
  }

  async resumeConversation(id: string): Promise<ConversationRecord | null> {
    return this.storage.load(id);
  }

  async listConversations(): Promise<Array<{ id: string; title: string; updatedAt: string }>> {
    return this.storage.list();
  }
}
