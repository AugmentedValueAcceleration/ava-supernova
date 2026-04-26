// Public leaderboard fetcher — single source of truth for both surfaces
// (extension dashboard-ui Models page + IDE DashboardPages Models page).
//
// Reads `leaderboard.json` directly from raw GitHub. No platform middleman,
// no caching layer where data could be tampered with — the bytes the user
// sees are byte-identical to the bytes anyone visiting the public bench
// repo sees. That equivalence is the trust claim.
//
// On a cache miss or stale cache, refetches in the background. On any
// error (404 because the public repo isn't live yet, network down,
// JSON parse fail) the function returns null so callers can render a
// graceful "leaderboard launching soon" empty state.

/** Mirror of ava-supernova-bench/bench/types.ts — kept structurally
 *  identical so a typecheck failure here means the bench schema drifted
 *  and the in-app render needs updating. */
export type BenchCategory =
  | 'tool_reliability'
  | 'edit_precision'
  | 'multi_step_coherence'
  | 'instruction_adherence'
  | 'cost_per_success'
  | 'latency';

export interface BenchCategoryScore {
  score: number;       // 0-100
  sample_size: number; // number of runs
}

export interface BenchModelScores {
  model_id: string;
  provider: string;
  display_name: string;
  overall_pass_rate: number;
  scores: Partial<Record<BenchCategory, BenchCategoryScore>>;
  summary: string;
}

export interface BenchLeaderboard {
  generated_at: string;
  categories: BenchCategory[];
  models: BenchModelScores[];
  total_runs: number;
}

const LEADERBOARD_URL = 'https://raw.githubusercontent.com/AugmentedValueAcceleration/ava-supernova-bench/main/leaderboard.json';
const CACHE_KEY = 'ava-bench-leaderboard';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day — bench publishes weekly so this is fresh enough

interface CacheEntry {
  fetched_at: number;
  data: BenchLeaderboard;
}

/** Read whatever's currently cached without triggering a refetch. Used
 *  for first-paint so the page renders immediately if there's any cached
 *  data, even if it's stale. The fresh fetch happens in the background. */
export function getCachedLeaderboard(): BenchLeaderboard | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.data ?? null;
  } catch { return null; }
}

/** True if the cache exists and is older than CACHE_TTL_MS. Callers
 *  use this to decide whether to background-refetch after the initial
 *  paint. */
export function isCacheStale(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return true;
    const entry = JSON.parse(raw) as CacheEntry;
    return Date.now() - entry.fetched_at > CACHE_TTL_MS;
  } catch { return true; }
}

/** Fetch the live leaderboard from raw GitHub. Returns null on any
 *  failure — empty repo (404), parse error, network down. Callers
 *  render the empty state when null. Updates cache on success. */
export async function fetchPublicLeaderboard(): Promise<BenchLeaderboard | null> {
  try {
    const res = await fetch(LEADERBOARD_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as BenchLeaderboard;
    if (!data || !Array.isArray(data.models)) return null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ fetched_at: Date.now(), data } satisfies CacheEntry));
      }
    } catch { /* quota / disabled — cache write is best-effort */ }
    return data;
  } catch {
    return null;
  }
}

/** Plain-language label for each category. Used in heatmap column
 *  headers and tooltips. Translated copy already lives in the i18n
 *  files; surfaces can localise by mapping these constants. */
export const BENCH_CATEGORY_LABELS: Record<BenchCategory, string> = {
  tool_reliability:      'Picks the right tool',
  edit_precision:        "Doesn't break things",
  multi_step_coherence:  'Holds the plan',
  instruction_adherence: 'Reads the room',
  cost_per_success:      'Cost / real task',
  latency:               'Speed',
};

/** One-line picker badge text for a model — pulled from leaderboard
 *  if available, otherwise a non-committal default that doesn't lie
 *  about a model we haven't scored. */
export function getPickerSummary(modelId: string, leaderboard: BenchLeaderboard | null): string | null {
  if (!leaderboard) return null;
  const m = leaderboard.models.find(x => x.model_id === modelId);
  return m?.summary ?? null;
}
