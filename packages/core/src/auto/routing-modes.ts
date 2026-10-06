/**
 * Every orchestrated fleet, as a RUNTIME list — with the type derived from it,
 * so the two cannot disagree.
 *
 * Its own file, with no imports, so any surface can take it through a narrow
 * subpath (`@ava/core/routing-modes`) without dragging the auto barrel — and
 * therefore the whole tool registry — into a browser bundle. That reachability
 * IS the point: the reason this kept going wrong is that surfaces which could
 * not cheaply import the list wrote their own.
 *
 * It has now gone wrong NINE times in the same shape, most recently three
 * separate hand-written copies inside one product:
 *
 *   sidecar/index.mjs        `data.model === 'auto' || 'supernova' || 'aurora'`
 *   DashboardPages.tsx:3704  the same chain, deciding the platform: prefix
 *   DashboardPages.tsx:3880  the same chain again, twenty lines of context apart
 *
 * All three omitted 'longxiang'. The first made the fleet unselectable; the
 * other two prefixed it into `platform:longxiang`, an id that never existed.
 * The extension's list was correct throughout, which is exactly why it took a
 * live test to find any of them.
 */

export const ROUTING_MODES = ['auto', 'supernova', 'aurora', 'longxiang'] as const;

export type RoutingMode = typeof ROUTING_MODES[number];

/**
 * Which fleets are OFFERED. The type above stays complete on purpose.
 *
 * Aurora and Longxiang are dark from 2026-10-06. We approached five labs on
 * 9 Sep and only Qwen and DeepSeek answered, so a fleet built on Mistral and
 * one built on Moonshot are both advertising a relationship that does not
 * exist yet. Supernova (DeepSeek + Qwen) and Maestro (Qwen) stand on labs that
 * did reply.
 *
 * Flags rather than deletion, and the ids stay in ROUTING_MODES, because:
 *   - a saved preference of `aurora` must still PARSE, so the router can fall
 *     back cleanly instead of treating it as an unknown model id;
 *   - the routing tables stay exercisable by the test suite;
 *   - re-enabling is one boolean when a lab writes back, not a revert.
 *
 * These live HERE, in the file with no imports, for the reason the header
 * gives: every surface can reach this through a narrow subpath, and the nine
 * previous failures all came from surfaces that could not and wrote their own.
 * A picker that hides a fleet by hand is the tenth.
 */
export const AURORA_ENABLED = false;
export const LONGXIANG_ENABLED = false;

/** The fleets a picker should actually show. Use THIS for anything
 *  user-facing; use ROUTING_MODES for parsing and type checks. */
export const VISIBLE_ROUTING_MODES: readonly RoutingMode[] = ROUTING_MODES.filter((m) =>
  (m === 'aurora' ? AURORA_ENABLED : m === 'longxiang' ? LONGXIANG_ENABLED : true),
);

/** True when a fleet is currently offered. A disabled fleet is still a valid
 *  RoutingMode — it just must not appear anywhere a user can pick it. */
export function isVisibleRoutingMode(id: string | undefined | null): id is RoutingMode {
  return !!id && (VISIBLE_ROUTING_MODES as readonly string[]).includes(id);
}

/**
 * True when an id names a fleet rather than a single model.
 *
 * Deliberately strict about the bare id: `platform:longxiang` is NOT a fleet,
 * it is the bug — a fleet id that has already had a provider prefix glued to
 * it by a caller that did not recognise it.
 */
export function isRoutingMode(id: string | undefined | null): id is RoutingMode {
  return !!id && (ROUTING_MODES as readonly string[]).includes(id);
}
