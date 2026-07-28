// ─── HealthPlanStore — surface-injected plan persistence ─────────────────────
//
// The two health-plan tools (`health_plan_create`, `health_plan_update_day`)
// call through this interface. Each surface implements it:
//
//   • Extension — wraps the VS Code globalState CRUD in DashboardPanel.ts
//     (per-plan `ava.healthPlan.${id}` + summary index `ava.planIndex`).
//   • IDE       — wraps the Tauri-fs CRUD in lib/health-plans-store.ts
//     (per-plan JSON file under ~/.ava/health/plans/).
//
// The host injects the implementation into `ToolExecutionContext.sharedState`
// at agent boot, the same way `taskManager` / `journalManager` /
// `memoryManager` are wired.
//
// See COMMAND_PALETTE_PLAN.md §10.

import type {
  HealthPlanCreateInput,
  HealthPlanUpdateInput,
  HealthPlanDay,
  HealthPlanSummary,
  HealthPlanStatus,
  HealthPlanType,
} from './types.js';

/** What `create()` returns — enough to surface to the agent (and the
 *  operator) without dragging back the full plan + profile snapshot. */
export interface HealthPlanCreated {
  id: string;
  type: HealthPlanType;
  title: string;
  duration_days: number;
  status: HealthPlanStatus;
  /** How many days the adapter filled from the create call's `days[]`. */
  filled_days: number;
}

/** What `updateDay()` returns. Null at the store level means "no plan
 *  matched that id". */
export interface HealthPlanDayUpdated {
  plan_id: string;
  day_index: number;
}

export interface HealthPlanStore {
  /** Lightweight library summary — most-recently-updated first. */
  list(): Promise<HealthPlanSummary[]>;
  /** Create a new plan. Adapter generates id, snapshots profile, stamps
   *  timestamps, builds days from `input.days` or a blank skeleton.
   *  Activating archives any existing active plan per the surface's own
   *  one-active rule. */
  create(input: HealthPlanCreateInput): Promise<HealthPlanCreated>;
  /** Upsert one day of an existing plan. Returns null when the plan id
   *  is unknown (let the tool surface the error). */
  updateDay(planId: string, day: HealthPlanDay): Promise<HealthPlanDayUpdated | null>;
  /**
   * Change an existing plan's title, goal, status or start date.
   *
   * Without this there was no way to ACTIVATE a plan that already existed —
   * so "make that draft active" could only be answered by creating a second
   * plan, which is exactly what happened: two identical plans, one draft, one
   * active, starting on the wrong day.
   *
   * Returns null when the plan id is unknown.
   */
  update(planId: string, input: HealthPlanUpdateInput): Promise<HealthPlanSummary | null>;
}
