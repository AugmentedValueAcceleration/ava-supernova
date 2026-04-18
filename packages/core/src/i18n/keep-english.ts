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
  'dash.nav.creative_studio',

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
] as StringKey[]);
