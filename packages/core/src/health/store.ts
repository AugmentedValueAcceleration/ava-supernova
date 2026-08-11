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
  HealthPlanRecord,
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

  // ── Deleting a plan ───────────────────────────────────────────────────────
  //
  // Optional on purpose. Four adapters implement this interface and two of
  // them live in another repo against a published core, so a required method
  // would break them on the next version bump for a capability they may not
  // want. Absent = "this surface does not delete plans", which the tool says
  // plainly rather than failing.
  //
  // Deleting is not the opposite of creating. Archiving is reversible and is
  // what the UI's status control already does; deletion destroys the meal logs
  // held INSIDE the plan — what somebody ate, skipped, or ate instead — and
  // that is a record of their life, not scaffolding. Hence get() and
  // loggedSessionCount(): the tool must be able to find out what it is about
  // to take before it takes it.

  /** The full plan, days included. Needed to count what has been logged
   *  against it — list() summaries do not carry days. */
  get?(planId: string): Promise<HealthPlanRecord | null>;

  /** How many gym sessions with at least one logged set point at this plan.
   *
   *  Sessions live in their own store keyed by id, so they SURVIVE the plan
   *  being deleted — but they carry plan_id, and that reference goes dangling.
   *  Only the surface knows where its sessions are kept, so it answers this
   *  rather than the tool guessing.
   *
   *  Unimplemented means "cannot tell", which the tool treats as a reason to
   *  stop, not as a zero. */
  loggedSessionCount?(planId: string): Promise<number>;

  /** Delete the plan and its days for good. Returns false when the id is
   *  unknown. Callers are expected to have checked for logged history first —
   *  this method does not second-guess them. */
  remove?(planId: string): Promise<boolean>;
}
