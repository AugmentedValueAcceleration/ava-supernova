import type { Tool, ToolResult, ToolExecutionContext, ToolRiskLevel } from './types.js';
import type { FunctionSchema } from '../providers/types.js';
import type {
  ExerciseStore, ExerciseInput, ExerciseMuscleInput, ContraindicationInput,
} from '../exercises/index.js';
import { MOVEMENT_PATTERNS } from '../exercises/index.js';

/**
 * Emit a finished exercise to the gym's drafts — one call per movement.
 *
 * Same construction as write_recipe, and for a sharper reason. A recipe that
 * cannot be cooked wastes a dinner; a movement written badly hurts someone. So
 * this does not ASK for a safe, programmable exercise — it makes an unsafe or
 * unprogrammable one FAIL:
 *
 *   - Kit named in the steps but missing from the equipment list is REFUSED.
 *     Someone filtering for "bodyweight, at home" must never be handed a
 *     movement whose third step reaches for a barbell.
 *   - No primary muscle is REFUSED. Without one no plan can ever select it;
 *     the exercise exists and is unreachable.
 *   - No movement pattern is REFUSED. Muscle groups cannot tell a press from a
 *     hinge, so a week cannot be balanced without it.
 *   - A loaded, overhead or high-impact movement with no contraindications is
 *     REFUSED. That is the safety floor, not a nice-to-have.
 *
 * Everything lands UNPUBLISHED. Ava drafts, the operator publishes.
 */
export class WriteExerciseTool implements Tool {
  readonly name = 'write_exercise';
  readonly description =
    'Emit a finished exercise as a draft. Every piece of equipment the steps name must be in the equipment list, it must have a primary muscle and a movement pattern, and anything loaded or overhead must carry contraindications — all CHECKED, and a failure comes back with what to fix.';
  readonly riskLevel: ToolRiskLevel = 'write';
  readonly requiresConfirmation = false;

  readonly schema: FunctionSchema = {
    name: 'write_exercise',
    description:
      'Emit the finished exercise as a draft. Call ONCE per movement. The steps are checked against the equipment list, so anything the method reaches for must be listed. It must name what it is FOR (a primary muscle) and how the body moves (a movement pattern), or no plan can select or balance it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The canonical name of the movement.' },
        seed_id: { type: 'string', description: 'If written from a seed, pass its id so the seed leaves the backlog.' },
        movement_pattern: {
          type: 'string', enum: MOVEMENT_PATTERNS,
          description: 'REQUIRED. How the body moves. This is what balances a training week — muscle groups cannot tell a press from a hinge.',
        },
        force_type: { type: 'string', enum: ['push', 'pull', 'static'] },
        laterality: { type: 'string', enum: ['bilateral', 'unilateral', 'alternating'] },
        session_role: {
          type: 'string', enum: ['main', 'accessory', 'finisher', 'warmup', 'cooldown', 'mobility'],
          description: 'Where it sits in a session. Without it a plan cannot order one, and heavy work lands after the finisher.',
        },
        exercise_type: { type: 'string', enum: ['compound', 'isolation', 'bodyweight', 'cardio', 'mobility', 'plyometric', 'isometric', 'stretching', 'breathing'] },
        difficulty: {
          type: 'integer', minimum: 1, maximum: 5,
          description: '1 = has never trained and is nervous. 5 = advanced and load-bearing. Be honest: if everything is a 3, the number is decoration and beginners get intermediate plans.',
        },
        description: { type: 'string', description: 'What the movement is and what it is for. No hype.' },
        beginner_detail: { type: 'string', description: 'What a nervous first-timer needs to know that an experienced lifter does not.' },
        common_mistakes: { type: 'string', description: 'What goes wrong in practice, and what it costs.' },
        muscles: {
          type: 'array',
          description: 'REQUIRED, and at least one must be primary. Primary = what the exercise is FOR; everything else is secondary.',
          items: {
            type: 'object',
            properties: {
              muscle: { type: 'string', description: 'Muscle group name, e.g. "Glutes", "Lats", "Triceps".' },
              role: { type: 'string', enum: ['primary', 'secondary'] },
            },
            required: ['muscle', 'role'],
          },
        },
        equipment: {
          type: 'array', items: { type: 'string' },
          description: 'REQUIRED. Everything the movement needs. "Bodyweight" is a real and complete answer. Anything your steps reach for must appear here.',
        },
        steps: {
          type: 'array',
          description: 'The movement in order — set-up, then execution. Imperative and specific.',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              notes: { type: 'string' },
              safety_flag: { type: 'boolean', description: 'True when this step is the one that prevents an injury rather than improves a number.' },
            },
            required: ['action'],
          },
        },
        coaching_cues: {
          type: 'array', items: { type: 'string' },
          description: 'Short imperative cues — "chest up", "screw your feet into the floor". What a coach says while someone is under the bar, as distinct from the numbered steps.',
        },
        routine: {
          type: 'object',
          description: 'How to programme it. seconds_per_set INCLUDES the rest — it is what lets a plan answer "will this fit in thirty minutes". rpe or percent_1rm gives effort; sets and reps only give volume.',
          properties: {
            sets: { type: 'integer' },
            reps_target: { type: 'string' },
            rest_seconds: { type: 'integer' },
            tempo: { type: 'string' },
            frequency_per_week: { type: 'string' },
            progression: { type: 'string' },
            rpe: { type: 'number' },
            percent_1rm: { type: 'string' },
            seconds_per_set: { type: 'integer' },
          },
        },
        cardio: {
          type: 'object',
          description: 'For cardio only. Steady state and intervals are different prescriptions — do not force either into sets and reps.',
          properties: {
            style: { type: 'string', enum: ['steady', 'interval', 'circuit', 'sprint'] },
            duration_minutes: { type: 'integer' },
            heart_rate_zone: { type: 'string' },
            work_seconds: { type: 'integer' },
            rest_seconds: { type: 'integer' },
            rounds: { type: 'integer' },
          },
        },
        contraindications: {
          type: 'array',
          description: 'Who should not do this, and what to do instead. REQUIRED for anything loaded, overhead or high-impact. Use condition keys a health profile also speaks.',
          items: {
            type: 'object',
            properties: {
              condition: { type: 'string', description: "e.g. 'knee_pain', 'lower_back_pain', 'shoulder_impingement', 'pregnancy', 'hypertension'." },
              severity: { type: 'string', enum: ['avoid', 'caution', 'modify'] },
              note: { type: 'string', description: 'Why, and the substitute. "Avoid" with no alternative is a dead end for the reader.' },
            },
            required: ['condition', 'severity'],
          },
        },
        regression_of: { type: 'string', description: 'The easier version of the SAME movement, by name.' },
        progression_to: { type: 'string', description: 'The harder version of the SAME movement, by name.' },
        substitutions: {
          type: 'array', items: { type: 'string' },
          description: 'DIFFERENT movements that do the same job when the kit is missing or this one hurts. Not the same as a progression.',
        },
        demo_image_prompt: {
          type: 'string',
          description: 'A PERSON PERFORMING THE MOVEMENT — position, joint angles, camera angle, whole body in frame. Usually the hardest position of the rep, from the angle that makes the form legible. Never a description of the room: the existing library is 170 photographs of empty gyms because they were prompted as places.',
        },
      },
      required: ['name', 'movement_pattern', 'muscles', 'equipment', 'steps'],
    },
  };

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const store = context.sharedState?.exerciseStore as ExerciseStore | undefined;
    if (!store) return { success: false, output: 'The exercise library is not available in this context.' };

    const name = String(args.name ?? '').trim();
    if (!name) return { success: false, output: 'write_exercise requires a name.' };

    const muscles: ExerciseMuscleInput[] = Array.isArray(args.muscles)
      ? (args.muscles as Record<string, unknown>[]).map((m): ExerciseMuscleInput => ({
          muscle: String(m?.muscle ?? '').trim(),
          role: m?.role === 'primary' ? 'primary' : 'secondary',
        })).filter((m) => m.muscle)
      : [];

    if (!muscles.some((m) => m.role === 'primary')) {
      return {
        success: false,
        output:
          'REFUSED: no primary muscle. Mark at least one muscle as primary — what the exercise is FOR. ' +
          'Without it no plan can ever select this movement: it would exist in the library and be unreachable.',
      };
    }

    const equipment = Array.isArray(args.equipment)
      ? (args.equipment as unknown[]).map((e) => String(e).trim()).filter(Boolean)
      : [];
    if (!equipment.length) {
      return {
        success: false,
        output:
          'REFUSED: no equipment. List everything the movement needs — "Bodyweight" is a complete and correct answer where nothing is used. ' +
          'Anything your steps reach for must appear here, or someone filtering for what they own gets handed a movement they cannot do.',
      };
    }

    const steps = Array.isArray(args.steps)
      ? (args.steps as Record<string, unknown>[]).map((s) => ({
          action: String(s?.action ?? '').trim(),
          notes: s?.notes ? String(s.notes) : null,
          safety_flag: s?.safety_flag === true,
        })).filter((s) => s.action)
      : [];
    if (!steps.length) return { success: false, output: 'REFUSED: no steps. A movement with no method cannot be performed or checked.' };

    const contraindications: ContraindicationInput[] = Array.isArray(args.contraindications)
      ? (args.contraindications as Record<string, unknown>[]).map((c) => ({
          condition: String(c?.condition ?? '').trim(),
          severity: (['avoid', 'caution', 'modify'].includes(String(c?.severity)) ? c!.severity : 'caution') as ContraindicationInput['severity'],
          note: c?.note ? String(c.note) : null,
        })).filter((c) => c.condition)
      : [];

    const exercise: ExerciseInput = {
      name,
      seed_id: args.seed_id ? String(args.seed_id) : null,
      exercise_type: args.exercise_type ? String(args.exercise_type) : null,
      movement_pattern: (args.movement_pattern ?? null) as ExerciseInput['movement_pattern'],
      force_type: (args.force_type ?? null) as ExerciseInput['force_type'],
      laterality: (args.laterality ?? null) as ExerciseInput['laterality'],
      session_role: (args.session_role ?? null) as ExerciseInput['session_role'],
      difficulty: typeof args.difficulty === 'number' ? args.difficulty : null,
      description: args.description ? String(args.description) : null,
      beginner_detail: args.beginner_detail ? String(args.beginner_detail) : null,
      common_mistakes: args.common_mistakes ? String(args.common_mistakes) : null,
      muscles,
      equipment,
      steps,
      coaching_cues: Array.isArray(args.coaching_cues) ? (args.coaching_cues as unknown[]).map(String) : [],
      routine: (args.routine ?? null) as ExerciseInput['routine'],
      cardio: (args.cardio ?? null) as ExerciseInput['cardio'],
      contraindications,
      substitutions: Array.isArray(args.substitutions) ? (args.substitutions as unknown[]).map(String) : [],
      regression_of: args.regression_of ? String(args.regression_of) : null,
      progression_to: args.progression_to ? String(args.progression_to) : null,
      demo_image_prompt: args.demo_image_prompt ? String(args.demo_image_prompt) : null,
    };

    // ── The equipment law, and the safety floor ──
    const check = await store.check(exercise);
    if (check.status === 'fail') {
      const byKind = new Map<string, string[]>();
      for (const f of check.findings) {
        const arr = byKind.get(f.kind) ?? [];
        arr.push(f.term);
        byKind.set(f.kind, arr);
      }
      const lines = [...byKind.entries()].map(([kind, terms]) => `${kind}: ${terms.join(', ')}`);
      return {
        success: false,
        output:
          `REFUSED — this exercise did not pass its checks:\n${lines.join('\n')}\n\n` +
          check.findings.map((f) => `· ${f.message}`).join('\n') +
          '\n\nFix these and call write_exercise again. If the steps reach for kit, either add it to the equipment list or change the step — do not rewrite the whole movement to dodge one line.',
      };
    }

    const { id, error: saveError } = await store.save(exercise);
    if (!id) {
      return {
        success: false,
        output: saveError
          ? `The exercise passed its checks but COULD NOT BE SAVED: ${saveError}. Nothing was written — do not report it as created.`
          : 'The exercise passed its checks but COULD NOT BE SAVED — the store returned no id, so nothing was written. Do not report it as created.',
      };
    }

    return {
      success: true,
      output: JSON.stringify({
        ok: true,
        id,
        name,
        status: 'draft',
        movement_pattern: exercise.movement_pattern,
        primary: muscles.filter((m) => m.role === 'primary').map((m) => m.muscle),
        note: 'Saved as a DRAFT. The operator publishes.',
      }),
    };
  }
}
