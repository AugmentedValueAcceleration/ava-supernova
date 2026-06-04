// ─── Health file store ──────────────────────────────────────────────────────
//
// Single source of truth for health data on disk, under the account-scoped
// `<scopedDir>/health/`:
//   - profile.json
//   - plans/<id>.json
//   - daily-plans/<date>.json
//
// Health used to live in VS Code globalState, which meant it was NOT in
// ~/.ava and so the file-based export + `.ava-backup` captured none of it.
// Moving it to files makes it portable, scoped per account, and matches both
// the bundle's USER_DATA_PATHS ('health') and the IDE (which already uses
// files). Reads are synchronous (small local JSON, keeps existing call sites
// non-async); writes are async + atomic-enough for this low-frequency data.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type * as vscode from 'vscode';
import type { HealthProfile, HealthDailyPlan, HealthPlan } from './dashboard-message-types.js';

const PROFILE_KEY = 'ava.healthProfile';
const PLAN_PREFIX = 'ava.plan.';
const DAILY_PREFIX = 'ava.healthPlan.';

export const profilePath = (healthDir: string): string => join(healthDir, 'profile.json');
export const plansDir = (healthDir: string): string => join(healthDir, 'plans');
export const dailyDir = (healthDir: string): string => join(healthDir, 'daily-plans');

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf-8')) as T; } catch { return null; }
}

// ── Profile ────────────────────────────────────────────────────────────────
export function readProfile(healthDir: string): HealthProfile | null {
  const p = readJson<HealthProfile>(profilePath(healthDir));
  return p && p.schema_version === 1 ? p : null;
}
export async function writeProfile(healthDir: string, profile: HealthProfile): Promise<void> {
  await mkdir(healthDir, { recursive: true });
  await writeFile(profilePath(healthDir), JSON.stringify(profile, null, 2), 'utf-8');
}

// ── Plans (multi-week) ───────────────────────────────────────────────────────
export function listPlanIds(healthDir: string): string[] {
  try {
    return readdirSync(plansDir(healthDir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  } catch { return []; }
}
export function readPlan(healthDir: string, id: string): HealthPlan | null {
  const p = readJson<HealthPlan>(join(plansDir(healthDir), `${id}.json`));
  return p && p.schema_version === 1 ? p : null;
}
export async function writePlan(healthDir: string, plan: HealthPlan): Promise<void> {
  await mkdir(plansDir(healthDir), { recursive: true });
  await writeFile(join(plansDir(healthDir), `${plan.id}.json`), JSON.stringify(plan, null, 2), 'utf-8');
}
export async function deletePlan(healthDir: string, id: string): Promise<void> {
  await unlink(join(plansDir(healthDir), `${id}.json`)).catch(() => {});
}

// ── Daily plans ──────────────────────────────────────────────────────────────
export function readDailyPlan(healthDir: string, date: string): HealthDailyPlan | null {
  const p = readJson<HealthDailyPlan>(join(dailyDir(healthDir), `${date}.json`));
  return p && p.schema_version === 1 && p.date === date ? p : null;
}
export async function writeDailyPlan(healthDir: string, plan: HealthDailyPlan): Promise<void> {
  await mkdir(dailyDir(healthDir), { recursive: true });
  await writeFile(join(dailyDir(healthDir), `${plan.date}.json`), JSON.stringify(plan, null, 2), 'utf-8');
}

/**
 * One-time migration of health data out of VS Code globalState into files.
 * Copies each item to disk, then clears the globalState key — but only once
 * its file is confirmed written, so nothing is lost if a write fails. Idempotent
 * (no-op once globalState holds no health keys). Gated by the caller via a flag.
 */
export async function migrateHealthFromGlobalState(
  context: vscode.ExtensionContext,
  healthDir: string,
): Promise<number> {
  let moved = 0;
  // Profile
  const profile = context.globalState.get<HealthProfile | null>(PROFILE_KEY) ?? null;
  if (profile) {
    if (!existsSync(profilePath(healthDir))) await writeProfile(healthDir, profile);
    if (existsSync(profilePath(healthDir))) { await context.globalState.update(PROFILE_KEY, undefined); moved++; }
  }
  // Plans + daily plans
  for (const key of context.globalState.keys()) {
    if (key.startsWith(PLAN_PREFIX)) {
      const id = key.slice(PLAN_PREFIX.length);
      const plan = context.globalState.get<HealthPlan | null>(key) ?? null;
      if (!plan) continue;
      const dest = join(plansDir(healthDir), `${id}.json`);
      if (!existsSync(dest)) await writePlan(healthDir, plan);
      if (existsSync(dest)) { await context.globalState.update(key, undefined); moved++; }
    } else if (key.startsWith(DAILY_PREFIX)) {
      const date = key.slice(DAILY_PREFIX.length);
      const plan = context.globalState.get<HealthDailyPlan | null>(key) ?? null;
      if (!plan) continue;
      const dest = join(dailyDir(healthDir), `${date}.json`);
      if (!existsSync(dest)) await writeDailyPlan(healthDir, plan);
      if (existsSync(dest)) { await context.globalState.update(key, undefined); moved++; }
    }
  }
  return moved;
}
