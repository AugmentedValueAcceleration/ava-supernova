import type { StringKey } from './locales/en.js';

/**
 * Keys whose English value is intentionally preserved across all locales.
 *
 * Only add a key here if there is a clear reason the English form is correct
 * everywhere (brand names, universally-recognised technical tokens, strings
 * that are purely placeholders). Everything else must be translated.
 *
 * Used by `scripts/i18n-check.mjs` to skip English-leak warnings on these keys.
 */
export const KEEP_ENGLISH: ReadonlySet<StringKey> = new Set<StringKey>([
  // Brand / product names
  'welcome.title',
  'dash.titlebar.title',
  'dash.panel.terminal_title',

  // Ava (proper noun) used as a label in many surfaces
  'dash.calendar.ava',
  'dash.chat.ava',
  'dash.panel.ava',
  'dash.sidebar.ava',
  'dash.support.source.tool',
  'dash.nav.ava_chat',

  // Service / integration brand names
  'dash.connections.discord',
  'dash.connections.github',
  'dash.connections.slack',
  'dash.nav.connections_desc',

  // Product component names (cross-surface branding)
  'dash.releases.ide',
  'dash.releases.core',
  'dash.releases.extension',
  'dash.releases.companion',

  // Plan names — industry-standard English tier labels
  'dash.billing.plan.pro',
  'dash.billing.plan.ultra',
  'dash.billing.plan.enterprise',
  'dash.billing.plan.admin',
  'dash.section.admin',
  'dash.tasks.cat_admin',

  // News category tags
  'news.enterprise',
  'news.open_source',

  // CLI idioms (single-char prompts, universal)
  'cli.allow_yn',
  'cli.ok',

  // Placeholder-only / technical tokens
  'tool.git',
  'tool.http',

  // Health/diet/units + brand (auto-classified invariants, verified non-misses)
  'dash.billing.plan.free',
  'dash.creative.emotion_neutral',
  'dash.creative.voice_ava',
  'dash.journal.ava_entries',
  'dash.journal.ava_entry_legend',
  'dash.tasks.ava_progress',
  'health.browse.routine.tempo',
  'health.browse.workout.hiit',
  'health.browse.workout.hybrid',
  'health.browse.workout.pilates',
  'health.browse.workout.yoga',
  'health.home.meal.kcal',
  'health.home.n_min',
  'health.home.nutrition.kcal',
  'health.home.quick.ml',
  'health.home.quick.mood_value',
  'health.home.sleep.add_30',
  'health.home.sleep.sub_30',
  'health.home.training_load.min_of',
  'health.home.water.add_250',
  'health.home.water.add_500',
  'health.home.water.sub_250',
  'health.plans.per_week',
  'health.plans.weekday_initial.6',
  'health.profile.diet.halal',
  'health.profile.diet.keto',
  'health.profile.diet.kosher',
  'health.profile.diet.pescatarian',
  'health.profile.diet.vegan',
  'health.profile.diet.vegetarian',
  'health.profile.equip.kettlebell',
  'health.submit.ex_type.cardio',
  'health.submit.wk_type.hiit',
  'health.submit.wk_type.hybrid',
  'health.submit.wk_type.pilates',
  'health.submit.wk_type.yoga',
  'input.provider_free',
  'tasks.ava',
] as StringKey[]);
