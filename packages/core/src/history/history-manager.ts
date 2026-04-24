import type { Conversation } from '../agent/conversation.js';
import { getTextContent } from '../core/types.js';
import { HistoryStorage, type ConversationRecord } from './storage.js';
import type { PlatformHistorySync } from './platform-sync.js';

/**
 * Chat history is **local-only by design**. Conversations contain the
 * most privacy-sensitive content in the product — the user's code,
 * their prompts, tool output, file paths, debugging context — and
 * none of that needs to be in the cloud for Ava to do her job.
 *
 * The 5-layer memory pipeline already extracts the durable facts
 * (preferences, decisions, project architecture, patterns) from
 * conversations and persists those separately — that's what syncs
 * cross-device via MemoryManager. The raw transcript stays on the
 * machine where it was recorded.
 *
 * This manager:
 *   - writes conversations to disk (primary storage)
 *   - NEVER pushes them to any cloud endpoint
 *   - keeps the PlatformHistorySync reference so users can still
 *     DELETE anything that was synced under earlier versions (the
 *     dashboard "wipe cloud chat history" action routes through the
 *     delete path, not through save)
 *
 * If you're tempted to re-add a push branch here, read the commit
 * that removed it first — the decision was principled, not an
 * oversight.
 */
export class HistoryManager {
  private storage: HistoryStorage;
  private projectPath?: string;
  /** Retained for the delete-from-cloud path only. Never used to push. */
  private sync?: PlatformHistorySync;

  constructor(
    projectPath?: string,
    // `localOnly` is accepted for back-compat with existing callers (the
    // extension passes it based on the user's Data Mode toggle) but is
    // ignored — chat history is always local now. The option lives in
    // the type so we don't break callers in this release; it'll be
    // removed once every consumer has been updated.
    opts?: { sync?: PlatformHistorySync; localOnly?: boolean },
  ) {
    this.storage = new HistoryStorage();
    this.projectPath = projectPath;
    this.sync = opts?.sync;
  }

  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * The previous API accepted a `localOnly` toggle that gated cloud push.
   * Chat history is now local-only unconditionally — this method is
   * preserved as a no-op for callers that haven't been updated yet so
   * they don't break at runtime. It will be removed in a future release.
   *
   * @deprecated Chat history is always local. No toggle needed.
   */
  setLocalOnly(_value: boolean): void {
    // no-op
  }

  /** Expose the cloud-delete helper — UI uses this to wipe old cloud chats. */
  getCloudSync(): PlatformHistorySync | undefined {
    return this.sync;
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
    const ok = await this.storage.delete(id);
    // Delete remotely too if a platform sync is configured. Chat history
    // is local-only going forward, but users may still have old
    // conversations on the platform from earlier versions; deleting them
    // locally should clean up cloud residue too.
    if (ok && this.sync) {
      this.sync.delete(id).catch(() => {/* best-effort */});
    }
    return ok;
  }

  /**
   * Pull the latest conversations from the platform and merge into the
   * local store. Lists remote (light), then fetches full bodies only
   * for conversations newer than what's on disk — keeps the pull
   * cheap on big histories. Remote wins on newer updatedAt.
   *
   * Chat history is local-only going forward, but this method still
   * works as a ONE-WAY migration path: users with conversations uploaded
   * under earlier versions can pull them down to local before wiping
   * the cloud copy. It's a no-op when no platform sync is configured.
   *
   * Returns count of new + updated conversations.
   */
  async pullLatest(): Promise<number> {
    if (!this.sync) return 0;
    try {
      const remoteList = await this.sync.list();
      if (remoteList.length === 0) return 0;

      const localList = await this.storage.list();
      const localByIdMap = new Map(localList.map(c => [c.id, c]));

      let updated = 0;
      for (const r of remoteList) {
        const local = localByIdMap.get(r.conversation_id);
        const remoteNewer = !local || r.updated_at > local.updatedAt;
        if (!remoteNewer) continue;
        const detail = await this.sync.getDetail(r.conversation_id);
        if (!detail) continue;
        // Preserve projectPath + pinned from local when we had it.
        if (local) {
          const existing = await this.storage.load(local.id);
          if (existing?.projectPath) detail.projectPath = existing.projectPath;
          if (existing?.pinned) detail.pinned = existing.pinned;
        }
        await this.storage.save(detail);
        updated++;
      }

      return updated;
    } catch {
      return 0;
    }
  }
}
