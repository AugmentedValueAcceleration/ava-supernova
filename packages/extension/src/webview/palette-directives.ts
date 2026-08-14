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
      // Hands off for the same reason as the health plans below: curriculums
      // are built and taught in the Learning room, which holds the course
      // catalogue and the user's progress. This used to instruct
      // learning_teach + learning_create in the main chat, neither of which
      // is in the main chat's tool list.
      return {
        label: 'New learning path',
        directive:
          '[Palette action] The user clicked "New learning path" in the command palette. ' +
          'Their intent is confirmed — do NOT ask whether they want to learn something.\n\n' +
          'Curriculums are built in the LEARNING ROOM, not here. Do NOT assess their level, ' +
          'gather a subject and goal, or call learning_create — the room does all of that with ' +
          'their progress and the course catalogue loaded.\n' +
          '1. Call `open_learning_room`. If they have already said what they want to learn, pass ' +
          'it as `topic`, and pass anything specific they gave (current level, goal, why they ' +
          'want it) as `primer`, written in the FIRST PERSON as their opening message to the ' +
          'room. Omit both if nothing specific has been said.\n' +
          '2. Say one short, warm line alongside the button.',
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
 *  the plan type locked in by which button the user clicked.
 *
 *  These HAND OFF. Plans are built in the Health room, which is where the
 *  exercise/recipe catalogue and the user's health profile are loaded; the
 *  main chat does not build them and does not carry the tools to.
 *
 *  This used to walk the main chat through gathering a title, duration and
 *  status and then calling `health_plan_create` directly — a tool the main
 *  chat's tool list does not include. Its own description says "do NOT
 *  attempt to build the plan yourself in the main chat". So the button
 *  instructed an action Ava could not take, and left her to improvise. */
function makeHealthPlanDirective(type: 'meal' | 'fitness' | 'combined'): PaletteDirective {
  const LABELS = { meal: 'Meal plan', fitness: 'Fitness plan', combined: 'Combined plan' } as const;
  const label = LABELS[type];

  return {
    label,
    directive:
      `[Palette action] The user clicked "${label}" in the command palette. ` +
      `Their intent is confirmed — do NOT ask whether they want a plan, and do NOT ask the type ` +
      `(${type} is locked in).\n\n` +
      `Plans are built in the HEALTH ROOM, not here. Do NOT ask for a title, duration or status, ` +
      `and do NOT call \`health_plan_create\` — the room asks for all of that with their profile ` +
      `and the catalogue in front of it.\n` +
      `1. Call \`open_health_room\` with \`plan_type\`="${type}". If the conversation already ` +
      `contains anything specific about what they want — a goal, their schedule, equipment, ` +
      `dietary needs, injuries — pass it as \`primer\`, written in the FIRST PERSON as their ` +
      `opening message to the room, so it picks up the thread instead of starting cold. ` +
      `Omit \`primer\` if they have said nothing specific yet.\n` +
      `2. Say one short, warm line alongside the button. Do not narrate the handoff at length.`,
  };
}
