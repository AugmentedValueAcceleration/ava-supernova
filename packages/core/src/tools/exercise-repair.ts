import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { ExerciseStore, ExerciseMuscleInput } from '../exercises/index.js';

/* The repair set for the gym, mirroring the Pantry's. The doctrine is the same
   and was learned the same way: REPAIR, do not re-roll. Regenerating a whole
   exercise to chase one missing dumbbell is a fresh entry every time, with its
   own fresh gaps — a slot machine, not a repair. */

/** READ before you touch. The check compares words, so it cannot tell that
 *  "dumbbells" is covered by "dumbbell" or that "bar" is the pull-up bar
 *  already listed. She can — but only if she can see the real list. */
export class ReadExerciseTool implements Tool {
  readonly name = 'read_exercise';
  readonly description =
    'Read an existing exercise\'s ACTUAL equipment, muscles, steps and demo state before repairing it. Call this first, always.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'read_exercise',
    description:
      'Read one exercise in full: its equipment list, its muscles and which is primary, its steps, its movement pattern and difficulty, its contraindications, and whether its demonstration actually shows this movement. Use it before any repair, so you add only what is genuinely missing.',
    parameters: {
      type: 'object',
      properties: { exercise_id: { type: 'string' } },
      required: ['exercise_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };
    const snapshot = await store.readExercise(String(args.exercise_id ?? '').trim());
    if (!snapshot) return { success: false, output: 'No exercise with that id.' };
    return { success: true, output: JSON.stringify(snapshot) };
  }
}

/** Search first. A library's worst habit is the same movement under three
 *  names — a "dumbbell chest press" and a "dumbbell bench press" are one
 *  exercise written twice. */
export class FindExerciseTool implements Tool {
  readonly name = 'find_exercise';
  readonly description = 'Search the library by name BEFORE writing anything, so the same movement is not written twice.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'find_exercise',
    description:
      'Search existing exercises by name. Read-only. Use it before writing: if the movement already exists, improve that entry rather than adding a second. If two entries are truly the same movement, propose a merge and name both — you never merge anything yourself.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };
    const matches = await store.findExercise(String(args.query ?? '').trim());
    return { success: true, output: JSON.stringify({ matches, count: matches.length }) };
  }
}

/** The targeted fix for the equipment law. */
export class AddEquipmentTool implements Tool {
  readonly name = 'add_equipment';
  readonly description =
    'Add ONE missing piece of equipment to an existing exercise — the targeted fix for an equipment-check failure. Do not regenerate the movement to chase one line.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'add_equipment',
    description:
      'Add one piece of equipment to an exercise by id. Use it when the check says the steps reach for kit the list does not have — but only after read_exercise confirms it is genuinely absent rather than present under another name.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        equipment: { type: 'string', description: 'Equipment name, e.g. "Dumbbells", "Bench", "Resistance bands".' },
      },
      required: ['exercise_id', 'equipment'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const id = String(args.exercise_id ?? '').trim();
    const equipment = String(args.equipment ?? '').trim();
    if (!id || !equipment) return { success: false, output: 'add_equipment requires exercise_id and equipment.' };

    const result = await store.addEquipment(id, equipment);
    if (!result.ok) return { success: false, output: `Could not add equipment: ${result.error ?? 'unknown error'}` };

    const recheck = await store.recheck(id);
    return {
      success: true,
      output: JSON.stringify({
        ok: true, added: equipment,
        recheck: recheck ? recheck.status : 'not re-checked',
        remaining: recheck?.findings?.map((f) => `${f.kind}: ${f.term}`) ?? [],
      }),
    };
  }
}

/** Fix what it works, and which of those is the point of it. */
export class SetMusclesTool implements Tool {
  readonly name = 'set_muscles';
  readonly description =
    'Set which muscles an exercise works and which is primary. Use it when read_exercise shows none, or shows a primary that is plainly wrong.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'set_muscles',
    description:
      'Replace an exercise\'s muscle list. At least one must be primary — what the movement is FOR. Without a primary no plan can select it, so the exercise sits in the library unreachable.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        muscles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              muscle: { type: 'string' },
              role: { type: 'string', enum: ['primary', 'secondary'] },
            },
            required: ['muscle', 'role'],
          },
        },
      },
      required: ['exercise_id', 'muscles'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const id = String(args.exercise_id ?? '').trim();
    const muscles: ExerciseMuscleInput[] = Array.isArray(args.muscles)
      ? (args.muscles as Record<string, unknown>[]).map((m): ExerciseMuscleInput => ({
          muscle: String(m?.muscle ?? '').trim(),
          role: m?.role === 'primary' ? 'primary' : 'secondary',
        })).filter((m) => m.muscle)
      : [];
    if (!id || !muscles.length) return { success: false, output: 'set_muscles requires exercise_id and at least one muscle.' };
    if (!muscles.some((m) => m.role === 'primary')) {
      return { success: false, output: 'REFUSED: at least one muscle must be primary, or nothing can ever select this exercise.' };
    }

    const result = await store.setMuscles(id, muscles);
    if (!result.ok) return { success: false, output: `Could not set muscles: ${result.error ?? 'unknown error'}` };
    const recheck = await store.recheck(id);
    return { success: true, output: JSON.stringify({ ok: true, muscles, recheck: recheck?.status ?? 'not re-checked' }) };
  }
}

/** Re-shoot the demonstration — and verify it before keeping it. */
export class RegenerateDemoTool implements Tool {
  readonly name = 'regenerate_demo';
  readonly description =
    'Re-shoot an exercise\'s demonstration photograph and verify it shows the right movement before it is kept.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'regenerate_demo',
    description:
      'Generate a new demonstration image for an exercise. The image is CHECKED against the exercise name before it becomes the primary — asked for a hack squat, the model has produced a flawless leg press, so generation alone is not evidence. You author the prompt: a PERSON PERFORMING THE MOVEMENT — position, joint angles, camera angle, whole body in frame. Never a description of the room.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        image_prompt: {
          type: 'string',
          description: 'The person mid-movement, usually at the hardest position of the rep, from the angle that makes the form legible.',
        },
      },
      required: ['exercise_id', 'image_prompt'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const id = String(args.exercise_id ?? '').trim();
    const prompt = String(args.image_prompt ?? '').trim();
    if (!id || !prompt) return { success: false, output: 'regenerate_demo requires exercise_id and image_prompt.' };

    const result = await store.regenerateDemo(id, prompt);
    if (!result.ok) return { success: false, output: `Could not regenerate the demonstration: ${result.error ?? 'unknown error'}` };
    if (result.depicts === false) {
      return {
        success: false,
        output:
          'The image generated but did NOT show this exercise, so it was not made primary. This is the leg-press-for-hack-squat failure. ' +
          'Try again with a prompt that describes the machine or position more concretely — the angle of the body, what it is resting against, where the load sits.',
      };
    }
    return { success: true, output: JSON.stringify({ ok: true, engine: result.engine, verified: result.depicts === true }) };
  }
}

/** Run the check on an existing exercise. */
export class CheckExerciseTool implements Tool {
  readonly name = 'check_exercise';
  readonly description = 'Run the full check on an existing exercise and get back exactly what is wrong.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'check_exercise',
    description:
      'Check an existing exercise: equipment named in the steps against its list, a primary muscle, a movement pattern, contraindications on loaded or overhead work, and whether the demonstration shows the right movement.',
    parameters: {
      type: 'object',
      properties: { exercise_id: { type: 'string' } },
      required: ['exercise_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };
    const verdict = await store.recheck(String(args.exercise_id ?? '').trim());
    if (!verdict) return { success: false, output: 'No exercise with that id, or the check could not run.' };
    return { success: true, output: JSON.stringify(verdict) };
  }
}

/** Find the honest gaps. The library's are real and lopsided: 75 primary
 *  exercises for glutes against 3 for adductors and 4 for cardiovascular. */
export class ProposeExerciseSeedsTool implements Tool {
  readonly name = 'propose_exercises';
  readonly description =
    'Propose exercises worth ADDING — the honest gaps in coverage by muscle group, movement pattern, equipment or difficulty.';
  readonly riskLevel: ToolRiskLevel = 'safe';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'propose_exercises',
    description:
      'Propose movements the library is missing, each with the reason it belongs. Ask by muscle group, movement pattern, equipment or difficulty. The selection is the skill — a library with 75 glute exercises and 3 for adductors cannot build a balanced plan whatever its total.',
    parameters: {
      type: 'object',
      properties: {
        muscle: { type: 'string', description: 'Muscle group to fill, e.g. "Biceps".' },
        pattern: { type: 'string', description: 'Movement pattern to fill, e.g. "hinge".' },
        equipment: { type: 'string', description: 'Constrain to what someone owns, e.g. "Bodyweight".' },
        count: { type: 'integer', minimum: 1, maximum: 12 },
      },
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };
    const seeds = await store.proposeSeeds({
      muscle: args.muscle ? String(args.muscle) : undefined,
      pattern: args.pattern ? String(args.pattern) : undefined,
      equipment: args.equipment ? String(args.equipment) : undefined,
      count: typeof args.count === 'number' ? args.count : 6,
    });
    return { success: true, output: JSON.stringify({ seeds, count: seeds.length }) };
  }
}
