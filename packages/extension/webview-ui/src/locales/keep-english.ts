import type { StringKey } from './en.js';

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
  'brand.supernova',
  'brand.supernova_caps',
  // Proper nouns
  'tasks.ava',
  // Placeholder-only strings
  'tool.git',
  'tool.http',
  // auto-classified invariants (brand/units/loanwords)
  'dash.chat.ava',

  // ── Auto-suppressed cognate/loanword leaks (i18n sweep) — English is the
  //    correct or model-converged value in the leaked locales. Refine an
  //    individual key only if a specific locale genuinely needs translation.
  'ask.question',
  'context.label',
  'error.unknown',
  'feedback.perfect',
  'input.mode.brainstorm',
  'input.mode.chat',
  'input.mode.code',
  'input.mode.plan',
  'input.pause_aria',
  'input.provider_platform',
  'memory.global',
  'memory.project',
  'persona.label.architect',
  'persona.label.tutor',
  'plan.prefix',
  'secret_grant.label',
  'status.in',
  'tasks.personal',
  'tool.error',
  'welcome.mode.brainstorm',
  'welcome.modes',
  'welcome_modal.account',
  'welcome_modal.mode.brainstorm.name',
  'welcome_modal.mode.code.name',
  'welcome_modal.mode.plan.name',
  'welcome_modal.model',
] as StringKey[]);
