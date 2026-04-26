// Public benchmark surface — fetched from raw GitHub at
// https://raw.githubusercontent.com/AugmentedValueAcceleration/ava-supernova-bench/main/leaderboard.json
//
// Both the extension and IDE Models pages import from this barrel so
// they render identical data with surface-native chrome.

export {
  fetchPublicLeaderboard,
  getCachedLeaderboard,
  isCacheStale,
  getPickerSummary,
  BENCH_CATEGORY_LABELS,
} from './public-leaderboard.js';

export type {
  BenchCategory,
  BenchCategoryScore,
  BenchModelScores,
  BenchLeaderboard,
} from './public-leaderboard.js';
