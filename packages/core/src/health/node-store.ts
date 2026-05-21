// ─── Node HealthPlanStore (file-backed) ──────────────────────────────────────
//
// Concrete HealthPlanStore that persists plans as JSON files under a base
// directory (default ~/.ava/health/plans/). Used by the IDE sidecar — a Node
// subprocess that can't reach Tauri's renderer-side fs plugin — so the
// sidecar and the renderer share storage by hitting the same files via two
// different fs APIs.
//
// Mirrors the auto-archive rule the existing surface stores use: one active
// plan per type.
//
// See COMMAND_PALETTE_PLAN.md §10.

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  HealthPlanStore,
  HealthPlanCreateInput,
  HealthPlanCreated,
  HealthPlanDay,
  HealthPlanDayUpdated,
  HealthPlanSummary,
  HealthPlanType,
  HealthPlanSource,
  HealthPlanStatus,
} from './index.js';

/** On-disk shape — equivalent to the surface-local HealthPlan but with an
 *  opaque `profile_snapshot` so core stays free of HealthProfile. */
interface StoredPlan {
  schema_version: 1;
  id: string;
  type: HealthPlanType;
  title: string;
  goal: string | null;
  source: HealthPlanSource;
  status: HealthPlanStatus;
  duration_days: number;
  start_date: string | null;
  profile_snapshot: unknown | null;
  days: HealthPlanDay[];
  created_at: string;
  updated_at: string | null;
}

const DEFAULT_BASE_DIR = join(homedir(), '.ava', 'health', 'plans');

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toSummary(p: StoredPlan): HealthPlanSummary {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    status: p.status,
    duration_days: p.duration_days,
    source: p.source,
    updated_at: p.updated_at,
  };
}

export class NodeHealthPlanStore implements HealthPlanStore {
  private readonly baseDir: string;

  constructor(opts: { baseDir?: string } = {}) {
    this.baseDir = opts.baseDir ?? DEFAULT_BASE_DIR;
  }

  private planFile(id: string): string {
    return join(this.baseDir, `${id}.json`);
  }

  private async ensureDir(): Promise<void> {
    try {
      await mkdir(this.baseDir, { recursive: true });
    } catch { /* already exists */ }
  }

  private async readPlan(id: string): Promise<StoredPlan | null> {
    try {
      const raw = await readFile(this.planFile(id), 'utf-8');
      const parsed = JSON.parse(raw) as StoredPlan;
      if (parsed && parsed.schema_version === 1) return parsed;
    } catch { /* missing / malformed */ }
    return null;
  }

  private async writePlan(p: StoredPlan): Promise<void> {
    await this.ensureDir();
    await writeFile(this.planFile(p.id), JSON.stringify(p, null, 2), 'utf-8');
  }

  async list(): Promise<HealthPlanSummary[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(this.baseDir);
    } catch {
      return [];
    }
    const out: HealthPlanSummary[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const p = await this.readPlan(name.slice(0, -'.json'.length));
      if (p) out.push(toSummary(p));
    }
    return out.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }

  async create(input: HealthPlanCreateInput): Promise<HealthPlanCreated> {
    const id = newId();
    const now = new Date().toISOString();

    // Build day skeleton — fill from input.days where provided, blank
    // rest-day for any unfilled day_index in 1..duration_days.
    const fill = new Map<number, HealthPlanDay>();
    for (const d of input.days ?? []) {
      if (d.day_index >= 1 && d.day_index <= input.duration_days) {
        fill.set(d.day_index, d);
      }
    }
    const days: HealthPlanDay[] = [];
    for (let i = 1; i <= input.duration_days; i++) {
      days.push(fill.get(i) ?? {
        day_index: i, kind: 'rest', title: null, training: [], meals: [], notes: null,
      });
    }
    const filled_days = fill.size;

    // Auto-archive other active plans of the same type. Mirrors the IDE
    // renderer store and the extension globalState store.
    if (input.status === 'active') {
      const summaries = await this.list();
      for (const s of summaries) {
        if (s.id === id || s.type !== input.type || s.status !== 'active') continue;
        const full = await this.readPlan(s.id);
        if (full) {
          await this.writePlan({ ...full, status: 'archived', updated_at: now });
        }
      }
    }

    const plan: StoredPlan = {
      schema_version: 1,
      id,
      type: input.type,
      title: input.title,
      goal: input.goal ?? null,
      source: 'ava',
      status: input.status,
      duration_days: input.duration_days,
      start_date: input.status === 'active' ? now.slice(0, 10) : null,
      // profile_snapshot left null in the tool-driven path for v1; the
      // renderer-driven UI path fills it from the active HealthProfile.
      profile_snapshot: null,
      days,
      created_at: now,
      updated_at: now,
    };
    await this.writePlan(plan);

    return {
      id,
      type: plan.type,
      title: plan.title,
      duration_days: plan.duration_days,
      status: plan.status,
      filled_days,
    };
  }

  async updateDay(planId: string, day: HealthPlanDay): Promise<HealthPlanDayUpdated | null> {
    const plan = await this.readPlan(planId);
    if (!plan) return null;
    if (day.day_index < 1 || day.day_index > plan.duration_days) return null;

    const days = [...plan.days];
    const existingIdx = days.findIndex((d) => d.day_index === day.day_index);
    if (existingIdx >= 0) {
      days[existingIdx] = day;
    } else {
      days.push(day);
      days.sort((a, b) => a.day_index - b.day_index);
    }
    const now = new Date().toISOString();
    await this.writePlan({ ...plan, days, updated_at: now });
    return { plan_id: planId, day_index: day.day_index };
  }
}
