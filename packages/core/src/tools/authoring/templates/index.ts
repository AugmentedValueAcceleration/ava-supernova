/**
 * Template registry — built-in worked exemplars plus the writer's saved
 * templates, resolved by id with friendly fallbacks.
 */

import { BUILTIN_TEMPLATES } from './builtins.js';
import { loadUserTemplates } from './store.js';
import type { DocTemplate } from './template-model.js';

/** All templates (builtins + user), optionally filtered to one domain. */
export async function listTemplates(domain?: string): Promise<DocTemplate[]> {
  const user = await loadUserTemplates();
  const all = [...BUILTIN_TEMPLATES, ...user];
  return domain ? all.filter(t => t.domain === domain) : all;
}

/** Resolve a template by full id ('business/proposal'), short id ('proposal'),
 *  or title — user templates shadow builtins on an exact id match. */
export async function getTemplate(id: string): Promise<DocTemplate | undefined> {
  const norm = id.trim().toLowerCase();
  const all = await listTemplates();
  return (
    [...all].reverse().find(t => t.id.toLowerCase() === norm) ??
    all.find(t => t.id.toLowerCase().endsWith('/' + norm)) ??
    all.find(t => t.title.toLowerCase() === norm)
  );
}

export { BUILTIN_TEMPLATES } from './builtins.js';
export { loadHouseStyle, saveHouseStyle, saveUserTemplate, loadUserTemplates } from './store.js';
export { fillTemplate, templateSummary } from './template-model.js';
export type { DocTemplate, TemplateDomain, TemplateVar } from './template-model.js';
