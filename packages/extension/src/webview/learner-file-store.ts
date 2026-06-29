// ─── Learner profile file store ───────────────────────────────────────────────
//
// The EDITABLE half of the learner Progression profile: bio/headline + self-added
// skills/achievements. Stored at ACCOUNT level (<scopedDir>/learner.json). The
// EARNED half (skills/certs/achievements/stats) is derived from learning.json by
// @ava/core/learning and never written here — that separation is what keeps the
// credential honest (earned data can't be hand-edited). Mirrors general-file-store.

import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LearnerProfile } from './dashboard-message-types.js';

export const learnerProfilePath = (scopedDir: string): string => join(scopedDir, 'learner.json');

export function emptyLearnerProfile(): LearnerProfile {
  return {
    schema_version: 1,
    updated_at: null,
    identity: { display_name: null, headline: null, bio: null, avatar_url: null },
    self: { skills: [], achievements: [] },
  };
}

export function readLearnerProfile(scopedDir: string): LearnerProfile {
  try {
    const raw = JSON.parse(readFileSync(learnerProfilePath(scopedDir), 'utf-8')) as LearnerProfile;
    if (raw && raw.schema_version === 1) {
      // Defensive defaults so an older/partial file never crashes the page.
      return {
        schema_version: 1,
        updated_at: raw.updated_at ?? null,
        identity: {
          display_name: raw.identity?.display_name ?? null,
          headline: raw.identity?.headline ?? null,
          bio: raw.identity?.bio ?? null,
          avatar_url: raw.identity?.avatar_url ?? null,
        },
        self: {
          skills: Array.isArray(raw.self?.skills) ? raw.self.skills : [],
          achievements: Array.isArray(raw.self?.achievements) ? raw.self.achievements : [],
        },
      };
    }
  } catch {
    /* missing or unreadable — fall through to empty */
  }
  return emptyLearnerProfile();
}

export async function writeLearnerProfile(scopedDir: string, profile: LearnerProfile): Promise<void> {
  await mkdir(scopedDir, { recursive: true });
  const next: LearnerProfile = { ...profile, schema_version: 1, updated_at: new Date().toISOString() };
  await writeFile(learnerProfilePath(scopedDir), JSON.stringify(next, null, 2), 'utf-8');
}
