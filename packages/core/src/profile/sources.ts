/**
 * Reading the profile off disk, for Node hosts (extension host, IDE sidecar,
 * hub sidecar). Every file is optional; a missing or unreadable one is simply
 * absent. Files from a future schema are skipped rather than half-read.
 *
 *   <home>/general.json            identity + body basics
 *   <home>/health/profile.json     goals, constraints, schedule, training, kitchen, food
 *   <home>/health/plans/*.json     multi-week plans
 *   <home>/health/sessions/*.json  the training log
 *   <home>/learning.json           courses + streaks
 *   <home>/learner.json            self-listed skills
 *   <home>/profile-settings.json   which sections Ava sees everywhere
 */

import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVA_HOME } from '../core/constants.js';
import type { HealthPlanRecord } from '../health/types.js';
import type { GymSession } from '../health/session-types.js';
import type { LearningStore } from '../tools/learning.js';
import { normaliseHealthProfile } from './health-text.js';
import { PROFILE_SECTIONS, type ProfileFiles, type ProfileSection, type ProfileVisibility } from './types.js';

function readJson(path: string): any {  // eslint-disable-line @typescript-eslint/no-explicit-any
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function readDir<T>(dir: string, keep: (x: any) => boolean): T[] {  // eslint-disable-line @typescript-eslint/no-explicit-any
  let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out: T[] = [];
  for (const f of files) {
    const x = readJson(join(dir, f));
    if (x && keep(x)) out.push(x as T);
  }
  return out;
}

export function readGeneralProfileFile(home: string = AVA_HOME): any {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = readJson(join(home, 'general.json'));
  return g && g.schema_version === 1 ? g : null;
}

export function readHealthProfileFile(home: string = AVA_HOME): any {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = readJson(join(home, 'health', 'profile.json'));
  return p && p.schema_version === 1 ? normaliseHealthProfile(p) : null;
}

/** Current plans: schema 1, not archived. */
export function readHealthPlanFiles(home: string = AVA_HOME): HealthPlanRecord[] {
  return readDir<HealthPlanRecord>(join(home, 'health', 'plans'), (p) => p.schema_version === 1 && p.status !== 'archived');
}

/** The training log, newest first. */
export function readTrainingSessionFiles(home: string = AVA_HOME): GymSession[] {
  return readDir<GymSession>(join(home, 'health', 'sessions'), (s) => s.schema_version === 1)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function readLearningFiles(home: string = AVA_HOME): { store: LearningStore | null; selfSkills: string[] } {
  const store = readJson(join(home, 'learning.json')) as LearningStore | null;
  const learner = readJson(join(home, 'learner.json'));
  const selfSkills = Array.isArray(learner?.self?.skills) ? learner.self.skills : [];
  return { store: store && Array.isArray(store.curriculums) ? store : null, selfSkills };
}

/** Everywhere unless the person limited a section to its room. */
export function readProfileVisibility(home: string = AVA_HOME): ProfileVisibility {
  const raw = readJson(join(home, 'profile-settings.json'))?.visibility ?? {};
  const out = {} as ProfileVisibility;
  for (const s of PROFILE_SECTIONS) out[s] = raw[s] === 'room' ? 'room' : 'everywhere';
  return out;
}

/**
 * Set one section to 'everywhere' or 'room' (the Profile page's switch).
 * Keeps whatever else the file holds; written to a temp file and renamed so a
 * crash can't leave half a file. Returns the visibility now in force.
 */
export function writeProfileVisibility(section: ProfileSection, value: 'everywhere' | 'room', home: string = AVA_HOME): ProfileVisibility {
  if (!PROFILE_SECTIONS.includes(section)) throw new Error(`Unknown profile section: ${section}`);
  const file = join(home, 'profile-settings.json');
  const current = readJson(file);
  const next = { ...(current && typeof current === 'object' ? current : {}) };
  next.visibility = { ...(next.visibility ?? {}), [section]: value === 'room' ? 'room' : 'everywhere' };
  mkdirSync(home, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
  renameSync(tmp, file);
  return readProfileVisibility(home);
}

/** Every profile file, read once. Projects come from memory, not from here. */
export function readProfileFiles(home: string = AVA_HOME): ProfileFiles {
  return {
    general: readGeneralProfileFile(home),
    health: readHealthProfileFile(home),
    plans: readHealthPlanFiles(home),
    sessions: readTrainingSessionFiles(home),
    learning: readLearningFiles(home),
    visibility: readProfileVisibility(home),
  };
}

export type { ProfileSection };
