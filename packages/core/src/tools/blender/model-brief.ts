/**
 * The brief for a 3D model — agreed before anything is built.
 *
 * His lesson from the Albert Bridge (28 Oct 2026): the brief decides the
 * result, and research comes before the first polygon. Most people don't know
 * what to ask for, so the studio asks — and Ava proposes the answers with her
 * reasoning, because the person learns by questioning a position.
 *
 * Stored as brief.json in the model's own folder, so it travels with the model
 * (duplicate, copy to project) and both surfaces read the same file.
 *
 * ENFORCED, not advised: design_build_model refuses to run until the person
 * has agreed the brief on the card. Ava cannot agree it herself — the only way
 * to 'agreed' is agreeModelBrief, which the surfaces call from his button.
 * Re-proposing an agreed brief puts it back to 'proposed': a changed brief is
 * a new agreement.
 */

import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Tool, ToolExecutionContext, ToolResult, ToolRiskLevel } from '../types.js';
import type { FunctionSchema } from '../../providers/types.js';
import { modelsDir, modelSlug } from './paths.js';
import { briefStore, type BriefRecord } from '../brief-store.js';
import { readModelHistory, type ModelStep } from './model-history.js';

export interface ModelBriefFields {
  what: string;        // what it is
  where: string;       // where it lives / what it is for
  style: string;       // low-poly / stylised / realistic …
  dimensions: string;  // real-world size, researched
  references: string;  // what the references show
  target: string;      // Unreal / Unity / Godot / 3D print / renders …
  budget: string;      // detail budget: triangles, texture size
  condition: string;   // pristine → ruined
  extras: string;      // icon, variants, LODs … or "none"
  purpose: string;     // own project / marketplace …
}

export interface ModelBrief extends ModelBriefFields, BriefRecord {}

export const BRIEF_FIELDS: Array<[keyof ModelBriefFields, string, string]> = [
  ['what', 'What it is', 'e.g. "a worn wooden supply crate with iron corner brackets"'],
  ['where', 'Where it lives / what it is for', 'e.g. "the ruined London dock in the Earth chapter" or "a product shot for my shop"'],
  ['style', 'Style', 'low-poly, stylised or realistic — and why that suits where it lives'],
  ['dimensions', 'Real dimensions', 'researched, in metres, e.g. "1.2 × 0.8 × 0.8 m — a standard shipping crate"'],
  ['references', 'References', 'what the reference images you found show: construction, materials, details worth copying'],
  ['target', 'Where it goes', 'Unreal (FBX, Z-up), Unity (FBX, Y-up), Godot (glTF), a 3D print, renders only…'],
  ['budget', 'Detail budget', 'triangles and texture size, e.g. "~2k triangles, 2K textures"'],
  ['condition', 'Condition', 'pristine → worn → ruined, and what that means for this object'],
  ['extras', 'Extras', 'inventory icon, variants, LODs — or "none"'],
  ['purpose', 'Purpose', 'their own project, or for sale (a marketplace has stricter checks)'],
];

const store = briefStore<ModelBrief>(modelsDir, () => BRIEF_FIELDS.map(([k]) => k), 'blender');

export const briefPath = store.path;
export const readModelBrief = store.read;

/** His button on the card. The ONLY way a brief becomes agreed. */
export const agreeModelBrief = store.agree;
/** His edits on the card. Saving changes keeps it agreed only if nothing moved. */
export const saveModelBriefEdits = (slug: string, fields: Partial<ModelBriefFields>) => store.saveEdits(slug, fields);

export interface ModelSummary {
  slug: string;
  name: string;
  brief: ModelBrief | null;
  built: boolean;
  updatedAt: string;
  /** Every saved step, oldest first, so they can look back and return to one. */
  history: ModelStep[];
}

/** Every model folder — including ones with a brief and nothing built yet. */
export async function listModels(): Promise<ModelSummary[]> {
  const out: ModelSummary[] = [];
  for (const e of await readdir(modelsDir(), { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory()) continue;
    const dir = join(modelsDir(), e.name);
    const brief = await readModelBrief(e.name);
    const blend = join(dir, `${e.name}.blend`);
    const built = existsSync(blend);
    const mtime = (await stat(built ? blend : dir).catch(() => null))?.mtime ?? new Date(0);
    const briefTime = brief?.agreedAt || brief?.proposedAt;
    const updatedAt = briefTime && new Date(briefTime) > mtime ? briefTime : mtime.toISOString();
    out.push({ slug: e.name, name: brief?.name || e.name, brief, built, updatedAt, history: await readModelHistory(e.name) });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** A readable brief, for her context and the tool replies. */
export function formatModelBrief(b: ModelBrief): string {
  return BRIEF_FIELDS.map(([k, label]) => `${label}: ${b[k] || '—'}`).join('\n');
}

// ── design_propose_model_brief ───────────────────────────────────────────────

export class DesignProposeModelBriefTool implements Tool {
  readonly name = 'design_propose_model_brief';
  readonly description =
    'Propose the brief for a 3D model — what it is, where it lives, style, real dimensions, references, target, budget, condition, extras, purpose — for the person to question and agree BEFORE anything is built.';
  // Writes only the brief file in the model's own folder; builds nothing.
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'design_propose_model_brief',
    description:
      'Put the BRIEF for a 3D model on the card in the room, before anything is built. Research first (web_search for references and REAL dimensions), ' +
      'then propose YOUR point of view on every field with your reasoning — never hand the questions back to them; most people do not know what to ask for, which is why the studio asks. ' +
      'The person questions it, may edit it on the card, and agrees it there. design_build_model will not run until they have agreed. ' +
      'Call again with the full brief whenever the discussion changes it; a changed brief has to be agreed again. You cannot agree it yourself.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The model\'s name, e.g. "Worn Supply Crate". The same name is used for design_build_model.' },
        ...Object.fromEntries(BRIEF_FIELDS.map(([k, label, hint]) => [k, { type: 'string', description: `${label} — ${hint}.` }])),
        reasoning: { type: 'string', description: 'Why this brief: what you found in your research, what you weighed and rejected. This is the part they learn from.' },
      },
      required: ['name', ...BRIEF_FIELDS.map(([k]) => k), 'reasoning'],
    },
  };

  async execute(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<ToolResult> {
    const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '');
    const name = str('name');
    const slug = modelSlug(name);
    if (!slug) return { success: false, output: 'Missing `name` — the model\'s name.' };

    const missing = BRIEF_FIELDS.filter(([k]) => !str(k)).map(([, label]) => label);
    if (!str('reasoning')) missing.push('your reasoning');
    if (missing.length) {
      return { success: false, output: `The brief is missing: ${missing.join(', ')}. Every part shapes the model — a hole here is filled by guesswork when it is built.` };
    }

    const previous = await readModelBrief(slug);
    const brief: ModelBrief = {
      name,
      ...(Object.fromEntries(BRIEF_FIELDS.map(([k]) => [k, str(k)])) as unknown as ModelBriefFields),
      reasoning: str('reasoning'),
      status: 'proposed',
      proposedAt: new Date().toISOString(),
    };
    await store.propose(slug, brief, context);

    const wasAgreed = previous?.status === 'agreed';
    return {
      success: true,
      output:
        `Brief for "${name}" is on the card${wasAgreed ? ' — it changed, so it needs agreeing again before the next build' : ''}. ` +
        'Talk them through your reasoning, answer their questions, change it where they have a point. They agree it on the card; nothing is built until they do.',
      metadata: { model: slug },
    };
  }
}
