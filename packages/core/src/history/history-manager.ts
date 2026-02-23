import type { Conversation } from '../agent/conversation.js';
import { getTextContent } from '../core/types.js';
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
      ? (getTextContent(firstUserMsg.content).slice(0, 80) || 'Untitled')
      : 'Untitled';

    // Preserve createdAt if conversation already exists on disk
    const existing = await this.storage.load(conversation.id);

    const record: ConversationRecord = {
      id: conversation.id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: existing?.title || title, // preserve manual renames
      messages,
      ...(existing?.pinned ? { pinned: true } : {}),
    };

    await this.storage.save(record);

    // Prune oldest conversations in the background (don't block the save)
    this.storage.prune().catch(() => {/* best-effort */});
  }

  async resumeConversation(id: string): Promise<ConversationRecord | null> {
    return this.storage.load(id);
  }

  async listConversations(): Promise<Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>> {
    return this.storage.list();
  }

  async searchConversations(query: string): Promise<Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }>> {
    const all = await this.storage.list();
    const lowerQuery = query.toLowerCase();
    const results: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean }> = [];

    for (const entry of all) {
      // Quick check: title match
      if (entry.title.toLowerCase().includes(lowerQuery)) {
        results.push(entry);
        continue;
      }
      // Deep check: message content match
      const record = await this.storage.load(entry.id);
      if (!record) continue;
      const hasMatch = record.messages.some((m) => {
        const text = getTextContent(m.content);
        return text.toLowerCase().includes(lowerQuery);
      });
      if (hasMatch) results.push(entry);
    }

    return results;
  }

  async renameConversation(id: string, newTitle: string): Promise<boolean> {
    const record = await this.storage.load(id);
    if (!record) return false;
    record.title = newTitle;
    record.updatedAt = new Date().toISOString();
    await this.storage.save(record);
    return true;
  }

  async pinConversation(id: string, pinned: boolean): Promise<boolean> {
    const record = await this.storage.load(id);
    if (!record) return false;
    record.pinned = pinned;
    await this.storage.save(record);
    return true;
  }

  async exportConversation(id: string, format: 'markdown' | 'json'): Promise<string | null> {
    const record = await this.storage.load(id);
    if (!record) return null;

    if (format === 'json') {
      return JSON.stringify(record, null, 2);
    }

    // Markdown format
    const lines: string[] = [];
    lines.push(`# ${record.title}`);
    lines.push('');
    lines.push(`**Created:** ${record.createdAt}`);
    lines.push(`**Updated:** ${record.updatedAt}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of record.messages) {
      if (msg.role === 'system') continue;
      if (msg.role === 'tool') continue;
      const roleLabel = msg.role === 'user' ? '## User' : '## Ava';
      lines.push(roleLabel);
      lines.push('');
      lines.push(getTextContent(msg.content));
      lines.push('');
    }

    return lines.join('\n');
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }
}
