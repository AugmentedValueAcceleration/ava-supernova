// ─── GymSessionStore — surface-injected training-log persistence ────────────
//
// The exact shape `HealthPlanStore` already uses, for the same reason: core
// owns the contract, each surface owns where the bytes land.
//
//   • Companion  — its existing local store (IndexedDB/localStorage).
//   • Extension  — JSON files under the account-scoped health dir, beside
//                  plans and the profile.
//   • IDE        — Tauri fs, under ~/.ava/health/sessions/.
//
// Injected into `ToolExecutionContext.sharedState` at agent boot, alongside
// `healthPlanStore`.
//
// WHY THIS IS AN INTERFACE AND NOT A SECOND COPY PER SURFACE. The observing
// loop's whole promise is "same Ava, same memory". A phone that knows you
// trained on Tuesday, beside an editor that does not, is that promise broken —
// and broken in the way that is hardest to notice, because each surface looks
// internally consistent.

import type { GymSession, GymSessionStatus } from './session-types.js';

/** Enough to draw a history row or feed the observing loop, without loading
 *  every set of every session. */
export interface GymSessionSummary {
  id: string;
  date: string;
  status: GymSessionStatus;
  title: string | null;
  plan_id: string | null;
  day_index: number | null;
  /** Exercises that carry at least one logged set — NOT the number queued.
   *  A session with eight exercises and nothing logged is not eight-eighths
   *  of a workout, it is a session that did not happen. */
  logged_exercises: number;
  updated_at: string;
}

export interface GymSessionStore {
  /** Sessions in a date range, newest first. Both bounds inclusive, ISO dates. */
  list(from: string, to: string): Promise<GymSessionSummary[]>;
  /** One session in full — every exercise and every set. */
  get(id: string): Promise<GymSession | null>;
  /** The session for a date, when there is one. Surfaces keep at most one
   *  per date per plan day; a freestyle session on the same date is separate. */
  forDate(date: string): Promise<GymSession[]>;
  /** Create or replace. The caller owns id generation and timestamps so this
   *  stays a store rather than a half-model. */
  save(session: GymSession): Promise<void>;
  remove(id: string): Promise<void>;
}
