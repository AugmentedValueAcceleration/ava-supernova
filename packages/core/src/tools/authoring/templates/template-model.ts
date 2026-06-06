/**
 * Template model for the authoring engine.
 *
 * A template is a *worked exemplar* — a complete, well-written document of its
 * kind (front-matter + real prose at the right length and tone), not a blank
 * skeleton full of "TBD". `{{token}}` markers stand in only for the handful of
 * things that genuinely change (a name, a date, a subject). This gives Ava a
 * quality bar to match and shows a beginner what "great" looks like.
 *
 * Built-in templates are TS constants (so they ship on every surface without an
 * asset-copy build step); user templates are loaded from disk (templates/store).
 */

export type TemplateDomain = 'business' | 'editorial' | 'academic' | 'career' | 'custom';

export interface TemplateVar {
  key: string;
  label: string;
  default?: string;
}

export interface DocTemplate {
  /** Stable id, namespaced by domain — e.g. 'business/proposal'. */
  id: string;
  domain: TemplateDomain;
  title: string;
  description: string;
  /** Maps to a DocumentStyleProfile (margins, cover page, footer). */
  styleProfile: string;
  /** How this kind of document should read — guides Ava when she expands it. */
  toneGuide: string;
  /** Rough length expectation, surfaced to keep Ava in register. */
  lengthHint?: string;
  variables?: TemplateVar[];
  /** The worked-exemplar markdown (with front-matter and {{tokens}}). */
  body: string;
  source: 'builtin' | 'user';
}

function humanize(key: string): string {
  return key.replace(/[_.-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Fill `{{token}}` markers from supplied data. Unknown tokens become a clear,
 * bracketed prompt (e.g. `[Client Name]`) — never a blank or a "TBD" — so the
 * draft reads as a finished document with obvious spots to personalise.
 */
export function fillTemplate(tpl: DocTemplate, data: Record<string, string> = {}, today?: string): string {
  const varMap = new Map((tpl.variables ?? []).map(v => [v.key, v]));
  return tpl.body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const supplied = data[key];
    if (supplied != null && supplied !== '') return supplied;
    if ((key === 'date' || key === 'today') && today) return today;
    const v = varMap.get(key);
    if (v?.default) return v.default;
    return `[${v?.label ?? humanize(key)}]`;
  });
}

/** A short, scannable catalogue line for list_templates. */
export function templateSummary(t: DocTemplate): string {
  return `- ${t.id} — ${t.description}`;
}
