import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type { ExerciseStore, ExerciseMuscleInput, ExerciseRevision, MovementPattern, SessionRole, ConditionProposal } from '../exercises/index.js';
import { MOVEMENT_PATTERNS } from '../exercises/index.js';

const SESSION_ROLES: SessionRole[] = ['main', 'accessory', 'finisher', 'warmup', 'cooldown', 'mobility'];

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
    const snapshot = await store.readExercise(String(args.exercise_id ?? args.id ?? '').trim());
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
      'Look at the exercise library. CALL IT WITH NO QUERY to browse what we actually have — do that whenever you need a movement and none has been named. Pass a query only to check for one SPECIFIC movement (the duplicate check before writing). Returns the library total either way. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'OPTIONAL. A movement name, only when checking for that one. Omit it to browse the library.',
        },
      },
      required: [],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const query = String(args.query ?? '').trim();

    // Browse — the case that did not exist. Same failure as find_recipe: with
    // no way to SEE the library, a guessed name that misses is indistinguishable
    // from an empty shelf, and the honest-sounding conclusion is the wrong one.
    if (!query) {
      const { total, sample } = await store.browseExercises(30);
      return {
        success: true,
        output: JSON.stringify({
          library_total: total,
          showing: sample.length,
          exercises: sample,
          note: total > sample.length
            ? `A sample of ${sample.length} from ${total} movements. Pick from these, or query a name for a specific one. Do NOT invent a movement — we have plenty, and ours are form-verified.`
            : 'The whole library.',
        }),
      };
    }

    const matches = await store.findExercise(query);
    const { total } = await store.browseExercises(0);
    return {
      success: true,
      output: JSON.stringify({
        query,
        library_total: total,
        matches,
        count: matches.length,
        note: matches.length
          ? undefined
          : `No movement is NAMED "${query}". That is not an empty library — we have ${total}. `
            + 'Call find_exercise with no query to see what we do have.',
      }),
    };
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

    const id = String(args.exercise_id ?? args.id ?? '').trim();
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

/** Rewrite the writing of an entry that already exists.
 *
 *  The gap Ava reported from the Gym on 19 Sep 2026: she could add equipment,
 *  a contraindication or a muscle to an existing exercise, but not a word of
 *  its prose. write_exercise is create-only — it passed the gate and died on
 *  the slug key — and it has no id to point at. So an entry failing on
 *  `no_beginner` could only be finished by deleting it and landing it again
 *  under a new id, which breaks every plan referencing the old one. Seven
 *  repairs were parked as "operator-side" for want of this. */
export class ReviseExerciseTool implements Tool {
  readonly name = 'revise_exercise';
  readonly description =
    'Rewrite one or more written fields of an EXISTING exercise in place — description, beginner or advanced detail, common mistakes, steps, cues, demo prompt, difficulty, pattern, session role. The id stays. Checked before it lands.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'revise_exercise',
    description:
      'Set the given fields on an existing exercise by id and leave everything else exactly as it is. This is how a check failure on the WRITING is fixed — never by writing the movement again. Give only the fields you are changing; each one you give REPLACES that field whole. The entry is re-checked afterwards and the revision is refused if it would add a finding. For equipment, muscles or contraindications use their own tools.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        description: { type: 'string', description: 'What the movement is and what it is for. 20 words or more.' },
        beginner_detail: { type: 'string', description: 'What a first-timer gets wrong the first time and how to fix it, what it should feel like, when to stop. 40 words or more.' },
        advanced_detail: { type: 'string', description: 'Tempo, load and rep guidance, when and how to progress, the variations worth knowing. 40 words or more, never a restatement of the steps.' },
        common_mistakes: { type: 'string', description: 'The real ones for this movement, what each causes, the correction. 30 words or more.' },
        steps: {
          type: 'array',
          description: 'The WHOLE method, in order — this replaces every step, so give all of them. Plain strings, or objects with an "action" field when a step needs notes or a safety flag.',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              notes: { type: 'string' },
              safety_flag: { type: 'boolean' },
            },
            required: ['action'],
          },
        },
        coaching_cues: { type: 'array', items: { type: 'string' }, description: 'All of them — this replaces the list. Three to five.' },
        demo_image_prompt: { type: 'string', description: 'A person performing the movement — position, joint angles, camera angle. Saved on the entry; it does not re-shoot the demo (use regenerate_demo for that).' },
        difficulty: { type: 'integer', minimum: 1, maximum: 5 },
        movement_pattern: { type: 'string', enum: MOVEMENT_PATTERNS },
        session_role: { type: 'string', enum: ['main', 'accessory', 'finisher', 'warmup', 'cooldown', 'mobility'] },
      },
      required: ['exercise_id'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const id = String(args.exercise_id ?? args.id ?? '').trim();
    if (!id) return { success: false, output: 'revise_exercise requires exercise_id.' };

    const revision: ExerciseRevision = {};
    const text = (k: 'description' | 'beginner_detail' | 'advanced_detail' | 'common_mistakes' | 'demo_image_prompt') => {
      if (typeof args[k] === 'string' && (args[k] as string).trim()) revision[k] = (args[k] as string).trim();
    };
    text('description'); text('beginner_detail'); text('advanced_detail'); text('common_mistakes'); text('demo_image_prompt');
    if (Array.isArray(args.steps)) {
      revision.steps = (args.steps as unknown[]).map((s) => {
        if (typeof s === 'string') return { action: s.trim() };
        const o = (s ?? {}) as Record<string, unknown>;
        return { action: String(o.action ?? '').trim(), notes: o.notes ? String(o.notes) : null, safety_flag: o.safety_flag === true };
      }).filter((s) => s.action);
    }
    if (Array.isArray(args.coaching_cues)) {
      revision.coaching_cues = (args.coaching_cues as unknown[]).map(String).map((c) => c.trim()).filter(Boolean);
    }
    if (typeof args.difficulty === 'number' && Number.isInteger(args.difficulty) && args.difficulty >= 1 && args.difficulty <= 5) {
      revision.difficulty = args.difficulty;
    }
    if (typeof args.movement_pattern === 'string' && (MOVEMENT_PATTERNS as string[]).includes(args.movement_pattern)) {
      revision.movement_pattern = args.movement_pattern as MovementPattern;
    }
    if (typeof args.session_role === 'string' && SESSION_ROLES.includes(args.session_role as SessionRole)) {
      revision.session_role = args.session_role as SessionRole;
    }
    const changed = Object.keys(revision);
    if (!changed.length) return { success: false, output: 'revise_exercise: nothing to change — give at least one field.' };

    const result = await store.reviseExercise(id, revision);
    if (!result.ok) {
      return {
        success: false,
        output: JSON.stringify({
          ok: false,
          error: result.error ?? 'refused',
          // The findings the revision would have introduced — fix these, then
          // call again. The entry was not touched.
          would_add: (result.findings ?? []).map((f) => `${f.kind}: ${f.message}`),
        }),
      };
    }

    const recheck = await store.recheck(id);
    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        changed,
        recheck: recheck ? recheck.status : 'not re-checked',
        remaining: recheck?.findings?.map((f) => `${f.kind}: ${f.term}`) ?? [],
      }),
    };
  }
}

/** Propose a condition key the taxonomy does not have.
 *
 *  add_contraindication refuses a key it cannot find, and it is right to: the
 *  keys are what a user can declare in their profile and what a plan screens
 *  exercises against, so one invented mid-repair would be a label nobody can
 *  ever select. But twelve keys is thin — nothing for hip pain or an ankle —
 *  and the gap kept coming back as "Needs you". Now she proposes it with the
 *  reason, and the operator's approval in the hub is what creates the key. */
export class ProposeConditionTool implements Tool {
  readonly name = 'propose_condition';
  readonly description =
    'Propose a NEW contraindication key for the operator to approve — when the condition an exercise should carry has no key in the vocabulary. Not a repair in itself: the key exists only once approved.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'propose_condition',
    description:
      'Queue a condition key for the operator to add to the vocabulary. Use it when add_contraindication lists the keys and none is the condition this movement genuinely needs — after checking the nearest existing key is not already it. Say the reason in terms of the movement: who this protects and from what. Once approved, add it to the exercise with add_contraindication.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The key as a user would read it in their profile, e.g. "Hip pain / impingement", "Ankle injury (acute)".' },
        category: { type: 'string', enum: ['state', 'injury', 'condition'], description: 'state = pregnancy-like states; injury = acute damage; condition = ongoing.' },
        severity_hint: { type: 'string', enum: ['hard_block', 'strong_caveat'], description: 'hard_block when the movement should simply not be programmed for them; strong_caveat when it can be, with care.' },
        reason: { type: 'string', description: 'Why the vocabulary needs it — the movements it would guard and what it protects. One or two sentences.' },
        exercise_id: { type: 'string', description: 'The entry that prompted it, if there is one.' },
      },
      required: ['name', 'category', 'severity_hint', 'reason'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const name = String(args.name ?? '').trim();
    const category = String(args.category ?? '').trim();
    const severity = String(args.severity_hint ?? '').trim();
    const reason = String(args.reason ?? '').trim();
    if (!name || !reason || !['state', 'injury', 'condition'].includes(category) || !['hard_block', 'strong_caveat'].includes(severity)) {
      return { success: false, output: 'propose_condition requires name, category (state | injury | condition), severity_hint (hard_block | strong_caveat) and reason.' };
    }
    const proposal: ConditionProposal = {
      name, reason,
      category: category as ConditionProposal['category'],
      severity_hint: severity as ConditionProposal['severity_hint'],
      exercise_id: args.exercise_id ? String(args.exercise_id) : null,
    };
    const result = await store.proposeCondition(proposal);
    if (!result.ok) {
      return { success: false, output: result.existing ? `Not proposed: ${result.error} (${result.existing})` : `Could not propose: ${result.error ?? 'unknown error'}` };
    }
    return {
      success: true,
      output: JSON.stringify({
        ok: true, proposed: name,
        // What happens next, so the report can say it in one line instead of
        // asking the operator for something they will see in the hub anyway.
        next: 'Queued for the operator in the hub. The key exists once approved; add it to the exercise with add_contraindication then.',
      }),
    };
  }
}

/** Fix who should NOT do it, or should do it differently.
 *
 *  This existed as a hole for a long time: the repair kit could fix equipment,
 *  muscles and the demo photograph, but nothing could add a contraindication to
 *  an exercise already in the library. The gate FAILS any loaded, overhead or
 *  high-impact movement with an empty contraindication list, so those exercises
 *  were permanently unpublishable — and the only workaround, rewriting the whole
 *  exercise to add one line, would have created a duplicate. Found when Ava hit
 *  it on Farmer's Carry, Bear Crawl and Sled Push and correctly refused to fake
 *  a fix. */
export class AddContraindicationTool implements Tool {
  readonly name = 'add_contraindication';
  readonly description =
    'Add one contraindication to an existing exercise — a condition someone should avoid, modify or take care with. Use it when read_exercise or check_exercise shows a loaded, overhead or high-impact movement with none.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'add_contraindication',
    description:
      'Add ONE condition to an exercise, with how serious it is for THIS movement and what to do instead. Call it once per condition. Severity belongs to the pairing, not the condition: a bad knee is "modify" for a goblet squat and "avoid" for a depth jump.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        condition: {
          type: 'string',
          description: 'Condition name, e.g. "Lower back pain", "Shoulder impingement", "Knee pain". Must match one the library already carries.',
        },
        severity: {
          type: 'string',
          enum: ['avoid', 'caution', 'modify'],
          description: 'avoid = do not do it with this condition; modify = do it differently; caution = proceed carefully.',
        },
        note: {
          type: 'string',
          description: 'Why, and what to do instead. "Avoid" with no alternative is a dead end for the person reading it.',
        },
      },
      required: ['exercise_id', 'condition', 'severity'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const id = String(args.exercise_id ?? args.id ?? '').trim();
    const condition = String(args.condition ?? '').trim();
    const severity = String(args.severity ?? '').trim() as 'avoid' | 'caution' | 'modify';
    const note = String(args.note ?? '').trim() || undefined;

    if (!id || !condition) return { success: false, output: 'add_contraindication requires exercise_id and condition.' };
    if (!['avoid', 'caution', 'modify'].includes(severity)) {
      return { success: false, output: 'severity must be one of: avoid, caution, modify.' };
    }

    const result = await store.addContraindication(id, condition, severity, note);
    if (!result.ok) return { success: false, output: `Could not add contraindication: ${result.error ?? 'unknown error'}` };

    const recheck = await store.recheck(id);
    return {
      success: true,
      output: JSON.stringify({
        ok: true, added: condition, severity,
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

    const id = String(args.exercise_id ?? args.id ?? '').trim();
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

    const id = String(args.exercise_id ?? args.id ?? '').trim();
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
    const verdict = await store.recheck(String(args.exercise_id ?? args.id ?? '').trim());
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
