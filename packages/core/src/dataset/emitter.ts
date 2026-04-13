/**
 * Typed Ava event emitter.
 *
 * Architecture:
 *   - The emitter holds no business logic. It exists so the agent can
 *     fire decision events without knowing what (if anything) is
 *     listening. Capture is the consumer's problem; the agent just
 *     emits.
 *   - Trajectory context (trajectory_id, session_id, surface, mode,
 *     model_id) lives in AsyncLocalStorage so emit sites don't have to
 *     thread it through every call. Whoever opens an Agent.run() wraps
 *     the run in `withTrajectory()` and every emit underneath inherits
 *     the envelope.
 *   - Payloads are deep-cloned at emit time via `structuredClone`. A
 *     consumer that runs later (microtask, async I/O, whatever) can
 *     never observe a mutated event because the mutation happened
 *     after the snapshot. This is the root-cause fix for the
 *     multi-writer corruption that disabled capture in the first
 *     place.
 *   - Handlers run on a microtask so emit() is non-blocking and can
 *     never delay the user-visible response. A throwing handler
 *     cannot crash the agent — errors are swallowed by design,
 *     because dataset capture failing is never worth taking the chat
 *     down for.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type {
  AvaEvent,
  AvaEventType,
  AvaEventPayloadMap,
  AvaSurface,
  AvaMode,
} from './events.js';

// ─── Trajectory context (AsyncLocalStorage) ─────────────────────────────────

export interface TrajectoryContext {
  trajectory_id: string;
  parent_trajectory_id?: string;
  session_id: string;
  surface: AvaSurface;
  mode: AvaMode;
  model_id: string;
}

const trajectoryStorage = new AsyncLocalStorage<TrajectoryContext>();

/**
 * Open a trajectory context for the duration of `fn`. Every event
 * emitted inside `fn` (sync or async) inherits this envelope. Wrap
 * each top-level Agent.run() in this.
 */
export function withTrajectory<T>(
  ctx: Omit<TrajectoryContext, 'trajectory_id'> & { trajectory_id?: string },
  fn: () => T,
): T {
  const trajectory_id = ctx.trajectory_id ?? randomUUID();
  return trajectoryStorage.run({ ...ctx, trajectory_id }, fn);
}

/**
 * Open a child trajectory whose `parent_trajectory_id` points at the
 * currently-active trajectory. Use this when an orchestrator spawns a
 * sub-agent (e.g. Builder inside a planning run) so we can reconstruct
 * the orchestration tree at training time.
 */
export function withChildTrajectory<T>(
  overrides: Partial<TrajectoryContext>,
  fn: () => T,
): T {
  const parent = trajectoryStorage.getStore();
  if (!parent) {
    // No parent — degrade to a fresh top-level trajectory rather than
    // throwing. Calling code shouldn't crash because of bookkeeping.
    return withTrajectory(
      {
        session_id: overrides.session_id ?? 'unknown',
        surface: overrides.surface ?? 'cli',
        mode: overrides.mode ?? 'work',
        model_id: overrides.model_id ?? 'unknown',
        ...overrides,
      },
      fn,
    );
  }
  return withTrajectory(
    {
      parent_trajectory_id: parent.trajectory_id,
      session_id: parent.session_id,
      surface: parent.surface,
      mode: parent.mode,
      model_id: parent.model_id,
      ...overrides,
    },
    fn,
  );
}

/** Read the current trajectory context. Returns undefined if not in a trajectory. */
export function getTrajectory(): TrajectoryContext | undefined {
  return trajectoryStorage.getStore();
}

// ─── Typed emitter ──────────────────────────────────────────────────────────

type Handler<T extends AvaEventType> = (event: AvaEvent<T>) => void | Promise<void>;
type AnyHandler = (event: AvaEvent) => void | Promise<void>;

class AvaEventEmitter {
  private handlers = new Map<AvaEventType, Set<Handler<AvaEventType>>>();
  private wildcardHandlers = new Set<AnyHandler>();

  /**
   * Subscribe to one event type. Returns an unsubscribe function.
   * Handlers run on a microtask after `emit` returns, so handler work
   * cannot block or delay the emitter.
   */
  on<T extends AvaEventType>(type: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<AvaEventType>);
    return () => {
      set!.delete(handler as Handler<AvaEventType>);
    };
  }

  /** Subscribe to every event. Used by the dataset capture consumer. */
  onAll(handler: AnyHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => {
      this.wildcardHandlers.delete(handler);
    };
  }

  /**
   * Emit an event. Caller must be inside a `withTrajectory(...)` scope —
   * if not, the emit is silently dropped (we don't throw because the
   * agent shouldn't crash because of bookkeeping). Returns immediately;
   * handlers run on a microtask.
   */
  emit<T extends AvaEventType>(type: T, payload: AvaEventPayloadMap[T]): void {
    const ctx = trajectoryStorage.getStore();
    if (!ctx) return;

    const event: AvaEvent<T> = {
      event_id: randomUUID(),
      event_type: type,
      timestamp: new Date().toISOString(),
      trajectory_id: ctx.trajectory_id,
      parent_trajectory_id: ctx.parent_trajectory_id,
      session_id: ctx.session_id,
      surface: ctx.surface,
      mode: ctx.mode,
      model_id: ctx.model_id,
      payload: structuredClone(payload),
    };

    const typeHandlers = this.handlers.get(type);
    const wildcardHandlers = this.wildcardHandlers;

    queueMicrotask(() => {
      if (typeHandlers) {
        for (const h of typeHandlers) {
          this.runHandlerSafe(h, event);
        }
      }
      for (const h of wildcardHandlers) {
        this.runHandlerSafe(h, event);
      }
    });
  }

  /** For tests: drop every subscriber. */
  clearAllHandlers(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }

  private runHandlerSafe(handler: AnyHandler, event: AvaEvent): void {
    try {
      const result = handler(event);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {
          // Dataset capture errors must never bubble. By design.
        });
      }
    } catch {
      // Same.
    }
  }
}

/** Singleton — one event bus per process. */
export const avaEvents = new AvaEventEmitter();
