import { join } from 'node:path';
import type { Conversation } from '../agent/conversation.js';
import { getTextContent } from '../core/types.js';
import { HistoryStorage, type ConversationRecord, type ConversationSummary } from './storage.js';
import { deriveConversationTitle, isJunkTitle } from './conversation-title.js';

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

  /**
   * @param projectPath  optional workspace path, for per-project filtering.
   * @param globalDir     base data dir; transcripts live in `<globalDir>/history`.
   *                      Omit for the default `~/.ava/history` (CLI / anonymous).
   *                      The extension passes the account-scoped dir so signed-in
   *                      history is isolated and matches where the export reads.
   */
  constructor(projectPath?: string, globalDir?: string) {
    this.storage = new HistoryStorage(globalDir ? join(globalDir, 'history') : undefined);
    this.projectPath = projectPath;
  }

  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * Re-point storage at a new base dir (transcripts → `<globalDir>/history`).
   * Mutates this instance in place rather than forcing callers to construct a
   * new one — so existing holders (HistoryCoordinator, sharedState) stay valid
   * after the account-scoped dir is resolved post-construction.
   */
  setBaseDir(globalDir: string): void {
    this.storage = new HistoryStorage(join(globalDir, 'history'));
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const messages = conversation.getMessages();
    if (messages.length <= 1) return; // don't save empty conversations (system prompt only)

    // Name it after the first thing the operator actually SAID — not the first
    // `role: 'user'` message, which is often host machinery: a mode/room preamble
    // ([Chat Mode] …, [Design Studio] You are Ava …) or an internal primer
    // ([Memory Brief], [Honesty check …], the mid-run interjection). Taking those
    // raw is why the history list was full of Ava's own instructions to herself.
    const title = deriveConversationTitle(messages);

    // Preserve createdAt if conversation already exists on disk
    const existing = await this.storage.load(conversation.id);

    // Keep a real title (including a manual rename) but REPAIR a junk one. The
    // old `existing?.title || title` meant a scaffold title, once written, was
    // preserved forever — so every conversation already on disk would have kept
    // its garbage name even after the derivation was fixed.
    const keptTitle = isJunkTitle(existing?.title) ? title : existing!.title;

    const record: ConversationRecord = {
      id: conversation.id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: keptTitle,
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

  async listConversations(filterByProject = true): Promise<ConversationSummary[]> {
    const all = await this.storage.list();
    if (!filterByProject || !this.projectPath) return all;
    return all.filter((c) => c.projectPath === this.projectPath);
  }

  async searchConversations(query: string, filterByProject = true): Promise<ConversationSummary[]> {
    let all = await this.storage.list();
    if (filterByProject && this.projectPath) {
      all = all.filter((c) => c.projectPath === this.projectPath);
    }
    const lowerQuery = query.toLowerCase();
    const results: ConversationSummary[] = [];

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
