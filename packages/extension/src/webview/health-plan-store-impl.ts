// ─── Extension HealthPlanStore (VS Code globalState) ────────────────────────
//
// Concrete implementation of the core HealthPlanStore interface, wrapping the
// same VS Code globalState keys that DashboardPanel reads/writes — so the
// UI-driven and Ava-driven plan paths share one source of truth.
//
// Mirrors the auto-archive rule in DashboardPanel.saveHealthPlan: one active
// plan per type. UI live-refresh after an Ava-driven save is a follow-up; the
// impl exposes `onPlansChanged` so a future host can broadcast
// `health_plans_loaded` to the dashboard webview without re-plumbing this.
//
// See COMMAND_PALETTE_PLAN.md §10.

import * as vscode from 'vscode';
import type {
  HealthPlanStore,
  HealthPlanCreateInput,
  HealthPlanCreated,
  HealthPlanDay,
  HealthPlanDayUpdated,
  HealthPlanSummary,
} from '@ava/core/health';
import type { HealthPlan } from './dashboard-message-types.js';

// Same prefix DashboardPanel.PLAN_KEY_PREFIX uses — keep in sync. Plans
// in globalState are addressed as `ava.plan.${id}`; the list comes from
// scanning globalState.keys() for that prefix (no separate index key).
const PLAN_KEY_PREFIX = 'ava.plan.';
const planKey = (id: string): string => `${PLAN_KEY_PREFIX}${id}`;

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
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onPlansChanged?: () => void,
  ) {}

  async list(): Promise<HealthPlanSummary[]> {
    const ids = this.context.globalState.keys()
      .filter((k) => k.startsWith(PLAN_KEY_PREFIX))
      .map((k) => k.slice(PLAN_KEY_PREFIX.length));
    const out: HealthPlanSummary[] = [];
    for (const id of ids) {
      const p = this.context.globalState.get<HealthPlan | null>(planKey(id)) ?? null;
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
    if (input.status === 'active') {
      const ids = this.context.globalState.keys()
        .filter((k) => k.startsWith(PLAN_KEY_PREFIX))
        .map((k) => k.slice(PLAN_KEY_PREFIX.length));
      for (const otherId of ids) {
        const other = this.context.globalState.get<HealthPlan | null>(planKey(otherId)) ?? null;
        if (other && other.type === input.type && other.status === 'active') {
          await this.context.globalState.update(planKey(otherId), {
            ...other, status: 'archived', updated_at: now,
          });
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
    await this.context.globalState.update(planKey(id), plan);
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
    const plan = this.context.globalState.get<HealthPlan | null>(planKey(planId)) ?? null;
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
    await this.context.globalState.update(planKey(planId), next);
    this.onPlansChanged?.();

    return { plan_id: planId, day_index: day.day_index };
  }
}
