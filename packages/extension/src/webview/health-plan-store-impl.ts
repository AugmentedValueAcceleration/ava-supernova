// ─── Extension HealthPlanStore (file-backed) ────────────────────────────────
//
// Concrete implementation of the core HealthPlanStore interface, reading/writing
// the same `<scopedDir>/health/plans/*.json` files DashboardPanel uses — so the
// UI-driven and Ava-driven plan paths share one source of truth, and plans are
// captured by the file-based export + `.ava-backup` (globalState was not).
//
// Mirrors the auto-archive rule in DashboardPanel.saveHealthPlan: one active
// plan per type. The impl exposes `onPlansChanged` so the host can broadcast
// `health_plans_loaded` to the dashboard webview after an Ava-driven save.
//
// See COMMAND_PALETTE_PLAN.md §10.

import type {
  HealthPlanStore,
  HealthPlanCreateInput,
  HealthPlanCreated,
  HealthPlanDay,
  HealthPlanDayUpdated,
  HealthPlanSummary,
} from '@ava/core/health';
import type { HealthPlan } from './dashboard-message-types.js';
import * as healthStore from './health-file-store.js';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toSummary(p: HealthPlan): HealthPlanSummary {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    status: p.status,
    duration_days: p.duration_days,
    start_date: p.start_date,
    source: p.source,
    updated_at: p.updated_at,
  };
}

export class ExtensionHealthPlanStore implements HealthPlanStore {
  /** @param getHealthDir returns the account-scoped `<scopedDir>/health` dir
   *  (a getter so it stays correct if the scope is resolved post-construction). */
  constructor(
    private readonly getHealthDir: () => string,
    private readonly onPlansChanged?: () => void,
  ) {}

  async list(): Promise<HealthPlanSummary[]> {
    const dir = this.getHealthDir();
    const out: HealthPlanSummary[] = [];
    for (const id of healthStore.listPlanIds(dir)) {
      const p = healthStore.readPlan(dir, id);
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

    // Activating archives OTHER active plans OF THE SAME TYPE — mirrors
    // DashboardPanel.saveHealthPlan's one-active-per-type rule.
    const dir = this.getHealthDir();
    if (input.status === 'active') {
      for (const otherId of healthStore.listPlanIds(dir)) {
        const other = healthStore.readPlan(dir, otherId);
        if (other && other.type === input.type && other.status === 'active') {
          await healthStore.writePlan(dir, { ...other, status: 'archived', updated_at: now });
        }
      }
    }

    const plan: HealthPlan = {
      schema_version: 1,
      id,
      type: input.type,
      title: input.title,
      goal: input.goal ?? null,
      source: 'ava',
      status: input.status,
      duration_days: input.duration_days,
      start_date: input.status === 'active' ? now.slice(0, 10) : null,
      // profile_snapshot left null in the tool-driven path for v1. The UI
      // path fills it from the active HealthProfile in globalState; wiring
      // that into the tool path is a follow-up — the plan still works.
      profile_snapshot: null,
      days,
      created_at: now,
      updated_at: now,
    };
    await healthStore.writePlan(dir, plan);
    this.onPlansChanged?.();

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
    const dir = this.getHealthDir();
    const plan = healthStore.readPlan(dir, planId);
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
    const next: HealthPlan = { ...plan, days, updated_at: now };
    await healthStore.writePlan(dir, next);
    this.onPlansChanged?.();

    return { plan_id: planId, day_index: day.day_index };
  }
}
