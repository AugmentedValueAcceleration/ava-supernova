/**
 * Journal cloud sync — RETIRED.
 *
 * The journal is now fully local-first (like Tasks and Learning): entries live
 * only on the user's machine and never leave it. This implementation is kept as
 * an inert no-op so existing wiring compiles; it pushes nothing and pulls
 * nothing. The remaining wiring is removed surface-by-surface. Download/transfer
 * of journal data is handled by the local export/portability system instead.
 */

import type { JournalDay } from './types.js';
import type { PlatformJournalSync } from './journal-manager.js';

export class PlatformJournalSyncImpl implements PlatformJournalSync {
  constructor(_apiBase: string, _platformKey: string) {
    // Intentionally inert — journal no longer syncs to the cloud.
  }

  async pushEntry(_day: JournalDay): Promise<void> {
    // no-op: journal is local-only
  }

  async pullEntries(_from?: string, _to?: string): Promise<JournalDay[]> {
    return [];
  }
}
