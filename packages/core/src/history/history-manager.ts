import type { Conversation } from '../agent/conversation.js';
import { getTextContent } from '../core/types.js';
import { HistoryStorage, type ConversationRecord } from './storage.js';

/**
 * Chat history is **local-only, end-to-end**. Conversations contain
 * the most privacy-sensitive content in the product — the user's code,
 * their prompts, tool output, file paths, debugging context — and
 * none of that goes to any server. There is no save path to the
 * cloud, no list path, no pull, no per-id delete to the cloud. The
 * dashboard ships a one-shot "Wipe legacy cloud history" button that
 * hits `/conversations/all` for users who synced under earlier
 * versions and want to scrub the residue.
 *
 * The 5-layer memory pipeline already extracts the durable facts
 * (preferences, decisions, project architecture, patterns) from
 * conversations and persists those separately — that's what syncs
 * cross-device via MemoryManager. The raw transcript stays on the
 * machine where it was recorded.
 *
 * If you're tempted to re-add a cloud branch here, don't. The decision
 * is privacy-load-bearing, not an implementation oversight.
 */
export class HistoryManager {
  private storage: HistoryStorage;
  private projectPath?: string;

  constructor(projectPath?: string) {
    this.storage = new HistoryStorage();
    this.projectPath = projectPath;
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
      ...(existing?.projectPath || this.projectPath
        ? { projectPath: existing?.projectPath ?? this.projectPath }
        : {}),
    };

    await this.storage.save(record);

    // Prune oldest conversations in the background (don't block the save)
    this.storage.prune().catch(() => {/* best-effort */});

    // No cloud push. By design. See the class header.
  }

  async resumeConversation(id: string): Promise<ConversationRecord | null> {
    return this.storage.load(id);
  }

  async listConversations(filterByProject = true): Promise<Array<{ id: string; title: string; updatedAt: string; pinned?: boolean; projectPath?: string }>> {
    const all = await this.storage.list();
    if (!filterByProject || !this.projectPath) return all;
    return all.filter((c) => c.projectPath === this.projectPath);
  }

  async searchConversations(query: string, filterByProject = true): Promise<Array<{ id: string; title: string; updatedAt: string; pinned?: boolean; projectPath?: string }>> {
    let all = await this.storage.list();
    if (filterByProject && this.projectPath) {
      all = all.filter((c) => c.projectPath === this.projectPath);
    }
    const lowerQuery = query.toLowerCase();
    const results: Array<{ id: string; title: string; updatedAt: string; pinned?: boolean; projectPath?: string }> = [];

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
