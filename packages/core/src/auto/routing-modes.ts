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
 * True when an id names a fleet rather than a single model.
 *
 * Deliberately strict about the bare id: `platform:longxiang` is NOT a fleet,
 * it is the bug — a fleet id that has already had a provider prefix glued to
 * it by a caller that did not recognise it.
 */
export function isRoutingMode(id: string | undefined | null): id is RoutingMode {
  return !!id && (ROUTING_MODES as readonly string[]).includes(id);
}
