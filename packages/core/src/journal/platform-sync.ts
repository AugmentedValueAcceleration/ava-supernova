/**
 * Syncs journal entries to/from the Ava platform (Supabase).
 * Follows PlatformTaskSyncImpl pattern.
 */

import type { JournalDay } from './types.js';
import type { PlatformJournalSync } from './journal-manager.js';

export class PlatformJournalSyncImpl implements PlatformJournalSync {
  private readonly apiBase: string;
  private readonly platformKey: string;

  constructor(apiBase: string, platformKey: string) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.platformKey = platformKey;
  }

  async pushEntry(day: JournalDay): Promise<void> {
    try {
      await fetch(`${this.apiBase}/journal`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          date: day.date,
          user_content: day.userEntry?.content ?? null,
          user_mood: day.userEntry?.mood ?? null,
          user_tags: day.userEntry?.tags ?? [],
          ava_content: day.avaEntry?.content ?? null,
          ava_tags: day.avaEntry?.tags ?? [],
        }),
      });
    } catch { /* fire-and-forget */ }
  }

  async pullEntries(from?: string, to?: string): Promise<JournalDay[]> {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`${this.apiBase}/journal?${params}`, {
        headers: this.headers(),
      });
      if (!res.ok) return [];

      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((row: Record<string, unknown>) => ({
        version: 1 as const,
        date: String(row.date),
        userEntry: row.user_content ? {
          content: String(row.user_content),
          mood: row.user_mood as JournalDay['userEntry'] extends { mood?: infer M } ? M : never,
          tags: (row.user_tags as string[]) ?? [],
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        } : null,
        avaEntry: row.ava_content ? {
          content: String(row.ava_content),
          tags: (row.ava_tags as string[]) ?? [],
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        } : null,
      }));
    } catch {
      return [];
    }
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.platformKey}`,
      'Content-Type': 'application/json',
    };
  }
}
