/**
 * Syncs local chat history to/from the Ava platform (Supabase).
 * Uses the /api/history endpoints — `user_conversations` table.
 */

import type { ConversationRecord } from './storage.js';

/** Retry a fetch with exponential backoff. */
async function fetchWithRetry(url: string, opts: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || res.status < 500) return res;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return fetch(url, opts); // Final attempt
}

/** Lightweight list row from GET /api/history. */
export interface RemoteConversationSummary {
  conversation_id: string;
  title: string;
  mode?: string;
  model?: string | null;
  created_at: string;
  updated_at: string;
}

export class PlatformHistorySync {
  private readonly apiBase: string;
  private readonly platformKey: string;

  constructor(apiBase: string, platformKey: string) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.platformKey = platformKey;
  }

  /** List remote conversations (lightweight — no messages). */
  async list(): Promise<RemoteConversationSummary[]> {
    try {
      const res = await fetchWithRetry(`${this.apiBase}/history`, { headers: this.headers() });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** Fetch a single conversation's full messages + metadata. */
  async getDetail(conversationId: string): Promise<ConversationRecord | null> {
    try {
      const res = await fetchWithRetry(`${this.apiBase}/history/${encodeURIComponent(conversationId)}`, {
        headers: this.headers(),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        conversation_id?: string;
        title?: string;
        messages?: unknown;
        created_at?: string;
        updated_at?: string;
      } | null;
      if (!data || typeof data !== 'object' || !data.conversation_id) return null;
      return {
        id: data.conversation_id,
        title: data.title ?? 'Untitled',
        messages: Array.isArray(data.messages) ? (data.messages as ConversationRecord['messages']) : [],
        createdAt: data.created_at ?? new Date().toISOString(),
        updatedAt: data.updated_at ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Push a set of conversations to /api/history/sync in bulk. Platform
   * upserts by (user_id, conversation_id) so this is idempotent.
   */
  async push(records: ConversationRecord[]): Promise<{ synced: number; total: number }> {
    if (records.length === 0) return { synced: 0, total: 0 };
    try {
      const conversations = records.map(r => ({
        id: r.id,
        title: r.title,
        messages: r.messages,
        updatedAt: r.updatedAt,
      }));
      const res = await fetchWithRetry(`${this.apiBase}/history/sync`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ conversations }),
      });
      if (!res.ok) return { synced: 0, total: records.length };
      const data = (await res.json()) as { synced?: number; total?: number } | null;
      return {
        synced: typeof data?.synced === 'number' ? data.synced : 0,
        total: typeof data?.total === 'number' ? data.total : records.length,
      };
    } catch {
      return { synced: 0, total: records.length };
    }
  }

  /** Delete a conversation remotely. */
  async delete(conversationId: string): Promise<void> {
    try {
      await fetch(`${this.apiBase}/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
        headers: this.headers(),
      });
    } catch { /* best-effort */ }
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.platformKey}`,
      'Content-Type': 'application/json',
    };
  }
}
