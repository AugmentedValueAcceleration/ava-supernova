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
 *  the plan type locked in by which button the user clicked. Generation is
 *  SERVER-SIDE: Ava gathers the inputs, confirms (with the credit cost), and
 *  calls `health_plan_create` with NO inline days. The plan engine then
 *  builds the whole plan from the exercise/recipe library (items link to
 *  technique guides + live nutrition) and charges one flat fee. */
function makeHealthPlanDirective(type: 'meal' | 'fitness' | 'combined'): PaletteDirective {
  const LABELS = { meal: 'Meal plan', fitness: 'Fitness plan', combined: 'Combined plan' } as const;
  const label = LABELS[type];
  const perWeek = type === 'combined' ? 10 : 5;

  return {
    label,
    directive:
      `[Palette action] The user clicked "${label}" in the command palette. ` +
      `Their intent is confirmed — do NOT ask whether they want a plan, and do NOT ask the type ` +
      `(${type} is locked in).\n\n` +
      `Ava's plan engine builds the whole plan for you from the user's exercise/recipe library and ` +
      `charges one flat fee. You do NOT design the plan yourself, search the catalogue, or fill days — ` +
      `just gather the inputs, confirm, and create.\n` +
      `1. Ask the user for: (a) a clear title; (b) duration in days — one of 1, 7, 28, 56, 84; ` +
      `(c) an optional free-text goal; (d) status — \`draft\` (save without starting) or ` +
      `\`active\` (begin today; archives any existing active ${type} plan). Status has NO DEFAULT — ask explicitly.\n` +
      `2. CONFIRM the summary before creating, and TELL THEM THE COST: this plan costs ${perWeek} credits ` +
      `per week (e.g. a 4-week plan = ${perWeek * 4} credits). When status=active, name the plan that ` +
      `will be archived if any.\n` +
      `3. Call \`health_plan_create\` with \`type\`, \`title\`, \`goal\`, \`duration_days\` and \`status\` ` +
      `and NO \`days\` array — the engine generates and prices the full plan from the library. Do NOT call ` +
      `\`health_plan_update_day\` as part of creation; it is only for later manual edits.\n\n` +
      CONFIRM,
  };
}
