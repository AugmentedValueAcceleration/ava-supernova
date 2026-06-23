// ─── General profile file store ───────────────────────────────────────────────
//
// Identity + body basics (name, DOB, sex, height, weight, units), stored at
// ACCOUNT level (<scopedDir>/general.json) — separate from health
// (<scopedDir>/health/profile.json) so the data is reusable beyond the health
// surface. Split out of HealthProfile.body on 2026-06-21. The health room,
// plans and morning brief read across both stores.

import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { GeneralProfile, HealthProfile } from './dashboard-message-types.js';

export const generalProfilePath = (scopedDir: string): string => join(scopedDir, 'general.json');

export function readGeneralProfile(scopedDir: string): GeneralProfile | null {
  try {
    const raw = JSON.parse(readFileSync(generalProfilePath(scopedDir), 'utf-8')) as GeneralProfile;
    return raw && raw.schema_version === 1 ? raw : null;
  } catch {
    return null;
  }
}

export async function writeGeneralProfile(scopedDir: string, profile: GeneralProfile): Promise<void> {
  await mkdir(scopedDir, { recursive: true });
  await writeFile(generalProfilePath(scopedDir), JSON.stringify(profile, null, 2), 'utf-8');
}

export function emptyGeneralProfile(): GeneralProfile {
  return {
    schema_version: 1,
    updated_at: null,
    display_name: null,
    sex: null,
    date_of_birth: null,
    height_cm: null,
    weight_kg: null,
    body_fat_pct: null,
    units: 'metric',
  };
}

/**
 * One-time, NON-DESTRUCTIVE migration: if no general.json exists yet but a
 * legacy health profile still carries body basics, seed GeneralProfile from
 * them. Leaves health.json untouched (its deprecated `body` stays as harmless
 * legacy data — we just stop reading it). Returns the general profile to use
 * (existing, freshly seeded, or null when there's nothing to seed from).
 */
export async function migrateGeneralFromHealth(
  scopedDir: string,
  health: HealthProfile | null,
): Promise<GeneralProfile | null> {
  const existing = readGeneralProfile(scopedDir);
  if (existing) return existing;
  const body = health?.body;
  if (!body) return null;
  const seeded: GeneralProfile = {
    schema_version: 1,
    updated_at: health?.updated_at ?? null,
    display_name: null,
    sex: body.sex ?? null,
    date_of_birth: body.date_of_birth ?? null,
    height_cm: body.height_cm ?? null,
    weight_kg: body.weight_kg ?? null,
    body_fat_pct: body.body_fat_pct ?? null,
    units: 'metric',
  };
  await writeGeneralProfile(scopedDir, seeded);
  return seeded;
}
