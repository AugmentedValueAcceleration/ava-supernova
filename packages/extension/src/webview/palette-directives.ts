// ─── Command palette directive builder ───────────────────────────────────────
//
// A palette button fires a pre-classified intent: the user has already told
// us which tool they want, so Ava must NOT re-detect intent. This module turns
// a (tool, action) pair into the turn Ava actually receives — a short display
// label shown as the user's chat bubble, plus a directive that seeds the agent
// turn with the confirmed intent and the tool's required fields.
//
// The directives are intentionally schema-light: Ava sees each tool's full
// schema when she calls it. The directive's job is to confirm the intent and
// name the required fields so she gathers them instead of guessing.
//
// See COMMAND_PALETTE_PLAN.md.

import type { PaletteTool } from './message-types.js';

export interface PaletteDirective {
  /** Short text shown as the user's chat bubble. */
  label: string;
  /** Instruction Ava receives in place of free-form user text. */
  directive: string;
}

// Appended to every directive. The palette speeds up *intent* — it never
// means act silently. Ava confirms before the tool runs.
const CONFIRM =
  'Confirm the details with the user once before the tool runs — the palette ' +
  'button speeds up intent, it never means act without checking in.';

/**
 * Build the directive for a palette (tool, action) pair. Returns null for an
 * unrecognised pair so the caller can ignore it rather than run a blank turn.
 */
export function buildPaletteDirective(tool: PaletteTool, action: string): PaletteDirective | null {
  switch (`${tool}.${action}`) {
    case 'task.create':
      return {
        label: 'New task',
        directive:
          '[Palette action] The user clicked "New task" in the command palette. ' +
          'Their intent is confirmed — do NOT ask whether they want to create a task. ' +
          'Use the task_manage tool with action=create. The only required field is `title`. ' +
          'If a clear task title is obvious from recent conversation, propose it; otherwise ask ' +
          'the user for the title in one short question. Sensible defaults: priority=medium, ' +
          'category inferred from context, due_date=today unless the user gives one, scope=project. ' +
          CONFIRM,
      };
    case 'journal.create':
      return {
        label: 'New journal entry',
        directive:
          '[Palette action] The user clicked "New journal entry" in the command palette. ' +
          'Their intent is confirmed — do NOT ask whether they want to journal. ' +
          'Use the journal_write tool with action=write_user. The required field is `content`. ' +
          'Invite the user to share what they want to record and help shape it into an entry. ' +
          'Capture mood (1-5) and tags only if they mention them. ' +
          CONFIRM,
      };
    case 'memory.create':
      return {
        label: 'Remember this',
        directive:
          '[Palette action] The user clicked "Remember this" in the command palette. ' +
          'Their intent is confirmed — do NOT ask whether they want to save a memory. ' +
          'Use the memory_save tool. Required fields are `scope` and `content`. Ask the user ' +
          'what they want you to remember. Default scope=project, but explicitly confirm ' +
          'project vs global with the user before saving so you are both aligned. Never save ' +
          'credentials. ' +
          CONFIRM,
      };
    case 'support.create':
      return {
        label: 'Contact support',
        directive:
          '[Palette action] The user clicked "Contact support" in the command palette. ' +
          'Their intent is confirmed. Use the support_request tool. Required fields are ' +
          '`email`, `message` and `category`. If the user\'s email is already known, use it and ' +
          'confirm it; otherwise ask for it. Help the user describe the issue clearly and ' +
          'categorise it (bug, feature, question, account, feedback, teach, other). ' +
          CONFIRM,
      };
    case 'learning.create':
      return {
        label: 'New learning path',
        directive:
          '[Palette action] The user clicked "New learning path" in the command palette. ' +
          'Their intent is confirmed. First use learning_teach with action=assess to gauge the ' +
          'user\'s level, then learning_create. Gather the subject, level ' +
          '(beginner/intermediate/advanced/mixed) and goal before creating. ' +
          CONFIRM,
      };
    case 'creative.image':
    case 'creative.music':
    case 'creative.video':
    case 'creative.voice': {
      const kind = action; // image | music | video | voice
      return {
        label: `Generate ${kind}`,
        directive:
          `[Palette action] The user clicked "Generate ${kind}" in the command palette. ` +
          `Their intent is confirmed. Use the generate_${kind} tool. Ask the user for a clear ` +
          `description of what they want created, plus any specifics the tool supports. ` +
          CONFIRM,
      };
    }
    case 'plans.meal':
    case 'plans.fitness':
    case 'plans.combined':
      return makeHealthPlanDirective(action as 'meal' | 'fitness' | 'combined');
    default:
      return null;
  }
}

/** Health-plan palette directives — three shapes sharing one template, with
 *  the plan type locked in by which button the user clicked. Workflow is
 *  catalogue-first: Ava searches the user's library via
 *  `health_catalogue_search` before creating, so every exercise / meal in
 *  the plan is linked to a real catalogue row by slug. The UI then derives
 *  live nutrition (recipes) and renders technique guides (exercises). */
function makeHealthPlanDirective(type: 'meal' | 'fitness' | 'combined'): PaletteDirective {
  const LABELS = { meal: 'Meal plan', fitness: 'Fitness plan', combined: 'Combined plan' } as const;
  const label = LABELS[type];

  let surveyGuidance: string;
  let buildGuidance: string;
  if (type === 'fitness') {
    surveyGuidance =
      'search the exercise library with `health_catalogue_search` (kind="exercise") for the movement patterns, muscle groups, and goal this plan needs — so you know what is actually available before you commit to a structure.';
    buildGuidance =
      'compose the training from the exercises you found, passing each catalogue slug as `ref.slug` on its `training[]` entry.';
  } else if (type === 'meal') {
    surveyGuidance =
      'search the recipe library with `health_catalogue_search` (kind="recipe") for the courses, cuisines, and goal this plan needs — so you know what is actually available before you commit to a structure.';
    buildGuidance =
      'compose the meals from the recipes you found, passing each catalogue slug as `ref.slug` on its `meals[]` entry.';
  } else {
    surveyGuidance =
      'search BOTH libraries with `health_catalogue_search` — kind="exercise" for the training and kind="recipe" for the meals — for what this plan needs, so you know what is actually available before you commit to a structure.';
    buildGuidance =
      'compose training from the exercises and meals from the recipes you found, passing each catalogue slug as `ref.slug` on the matching `training[]` / `meals[]` entry.';
  }

  return {
    label,
    directive:
      `[Palette action] The user clicked "${label}" in the command palette. ` +
      `Their intent is confirmed — do NOT ask whether they want a plan, and do NOT ask the type ` +
      `(${type} is locked in).\n\n` +
      `You have three tools for this flow: \`health_catalogue_search\` (see what's in the library), ` +
      `\`health_plan_create\` (save the plan), \`health_plan_update_day\` (fill one day at a time).\n\n` +
      `WORKFLOW — survey the library FIRST, then build the plan from it. Do NOT invent the whole ` +
      `plan from memory and then check; that is what produces free-text orphans with no technique ` +
      `guide or nutrition.\n` +
      `1. Ask the user for: (a) a clear title; (b) duration in days — one of 1, 7, 28, 56, 84; ` +
      `(c) an optional free-text goal; (d) status — \`draft\` (save without starting) or ` +
      `\`active\` (begin today; archives any existing active ${type} plan). Status has NO ` +
      `DEFAULT — ask explicitly.\n` +
      `2. SURVEY: before composing anything, ${surveyGuidance}\n` +
      `3. BUILD FROM WHAT EXISTS: design a proper, well-structured plan — it still needs real ` +
      `programming and sensible progression, not just whatever happened to turn up — but ` +
      `${buildGuidance} Only free-text an entry (no \`ref\`) when the library genuinely has no fit ` +
      `for something the plan needs, and tell the user that entry isn't library-linked.\n` +
      `4. For 1- or 7-day plans, populate \`days[]\` in the same \`health_plan_create\` call. ` +
      `For 28 / 56 / 84-day plans, create the skeleton first then iterate ` +
      `\`health_plan_update_day\` per day with the plan_id from create — keeps each tool call bounded.\n` +
      `5. CONFIRM the plan summary with the user before calling \`health_plan_create\`. When ` +
      `status=active, name the plan that will be archived if any.\n\n` +
      `For meal entries with a recipe \`ref.slug\`, the UI derives nutrition live from recipe ` +
      `per-serving × \`servings\` — leave calories/protein_g/carbs_g/fat_g null in that case. ` +
      `Free-text meals carry hand-entered macros. For exercise entries with a \`ref.slug\`, the ` +
      `UI renders technique guides and demos automatically. ` +
      CONFIRM,
  };
}
