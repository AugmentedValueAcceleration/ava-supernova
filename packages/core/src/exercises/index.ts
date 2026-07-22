// ─── The gym — exercise types, the store contract, and the checks ────────────
//
// The recipe desk's central lie was the dish that reads perfectly and cannot be
// cooked. The gym's is worse, because it can hurt someone: an exercise whose
// steps say "grip the dumbbells" while it is filed as bodyweight, a demo
// picture showing a leg press above the words "hack squat", or a movement with
// no note that it is the wrong idea for a bad shoulder.
//
// Same discipline as the Pantry and the newsroom: the guarantee is ENFORCED IN
// CODE, not requested in a prompt.
//
// The split mirrors recipes/index.ts exactly:
//   · The deterministic comparisons live HERE, pure, no model and no network.
//   · Reading a method with a model, looking at an image, and writing to the
//     database are the SURFACE's job, injected as an ExerciseStore.

// ─── Shape ───────────────────────────────────────────────────────────────────

/** How the body is being asked to move. This — not the muscle list — is what
 *  balances a training week. A programme with four presses and no hinge is
 *  badly built even if the muscle counts look even, and you cannot see that by
 *  reading muscle groups alone. */
export type MovementPattern =
  | 'squat' | 'hinge' | 'lunge'
  | 'push_horizontal' | 'push_vertical'
  | 'pull_horizontal' | 'pull_vertical'
  | 'carry' | 'rotation' | 'anti_rotation'
  | 'gait' | 'isolation' | 'mobility';

export const MOVEMENT_PATTERNS: MovementPattern[] = [
  'squat', 'hinge', 'lunge', 'push_horizontal', 'push_vertical',
  'pull_horizontal', 'pull_vertical', 'carry', 'rotation', 'anti_rotation',
  'gait', 'isolation', 'mobility',
];

/** Push or pull, and one side or both. Two facts a programme needs constantly:
 *  push/pull to balance a session, unilateral to find and fix a side-to-side
 *  difference that a barbell will happily hide for years. */
export type ForceType = 'push' | 'pull' | 'static';
export type Laterality = 'bilateral' | 'unilateral' | 'alternating';

export interface ExerciseMuscleInput {
  /** Muscle group name or slug — the host resolves it. */
  muscle: string;
  /** primary = what the exercise is FOR. Everything else is secondary. An
   *  exercise with no primary cannot be programmed: nothing can ask for it. */
  role: 'primary' | 'secondary';
}

export interface ExerciseStepInput {
  action: string;
  notes?: string | null;
  /** Cues that stop an injury rather than improve a number. Surfaced in the
   *  app at the step they belong to, not buried in a paragraph underneath. */
  safety_flag?: boolean;
}

/** How to actually programme it. The library already carries this well; it is
 *  restated in the contract so a new exercise cannot land without it. */
export interface ExerciseRoutineInput {
  sets?: number;
  reps_target?: string;
  rest_seconds?: number;
  tempo?: string;
  frequency_per_week?: string;
  /** How the load goes up — the sentence that turns a list of exercises into
   *  a plan that gets somewhere. */
  progression?: string;

  /** EFFORT, not just volume. Sets and reps describe how much; without this
   *  nothing describes how hard, and every plan feels identical. RPE 1–10, or
   *  a percentage of one-rep max where that is the sensible language. */
  rpe?: number | null;
  percent_1rm?: string | null;

  /** Roughly how long one set takes, INCLUDING the rest after it. This is the
   *  number that makes "I have 30 minutes" work — without it a plan can pick
   *  exercises but cannot tell anyone whether the session fits. */
  seconds_per_set?: number | null;
}

/** Cardio is not strength with different numbers. Zone 2 steady state and
 *  intervals are different prescriptions, and a sets-and-reps schema cannot
 *  express either — which is why the library's 15 cardio entries currently
 *  cannot be programmed properly. */
export interface CardioPrescriptionInput {
  style?: 'steady' | 'interval' | 'circuit' | 'sprint';
  duration_minutes?: number | null;
  heart_rate_zone?: string | null;
  work_seconds?: number | null;
  rest_seconds?: number | null;
  rounds?: number | null;
}

/** Where it sits IN a session. Without this a plan can choose exercises but
 *  cannot order them, and heavy squats end up after the finisher. */
export type SessionRole = 'main' | 'accessory' | 'finisher' | 'warmup' | 'cooldown' | 'mobility';

/** Structured so the PLANNER can use it. Free text reads well and cannot be
 *  filtered: if someone's health profile says knee problems, the plan builder
 *  has to exclude automatically, and prose cannot be queried. The sentence
 *  still matters — it just travels alongside the code, not instead of it. */
export interface ContraindicationInput {
  /** Condition key the health profile also speaks: 'knee_pain', 'pregnancy',
   *  'hypertension', 'lower_back_pain', 'shoulder_impingement'. */
  condition: string;
  severity: 'avoid' | 'caution' | 'modify';
  /** Why, and what to do instead. "Avoid" without a substitute is a dead end
   *  for the person reading it. */
  note?: string | null;
}

export interface ExerciseInput {
  name: string;
  slug?: string;
  seed_id?: string | null;
  exercise_type?: string | null;
  movement_pattern?: MovementPattern | null;
  force_type?: ForceType | null;
  laterality?: Laterality | null;
  /** 1–5. Meaningless unless the library actually spreads across it — 132 of
   *  170 exercises sat at 3, which is a library with one difficulty wearing a
   *  number. */
  difficulty?: number | null;
  description?: string | null;
  beginner_detail?: string | null;
  common_mistakes?: string | null;
  muscles: ExerciseMuscleInput[];
  /** Everything the movement requires. "Bodyweight" is a real answer. */
  equipment: string[];
  steps: ExerciseStepInput[];
  routine?: ExerciseRoutineInput | null;
  cardio?: CardioPrescriptionInput | null;
  /** Main lift, accessory, finisher, warm-up, cool-down. Decides where in a
   *  session it can go. */
  session_role?: SessionRole | null;
  /** Short imperative cues — "chest up", "screw your feet into the floor".
   *  The steps are the sequence; these are what a coach says while you are
   *  under the bar, and what a demo image or video gets captioned with. */
  coaching_cues?: string[];
  /** Who should not do this, and why. Empty is a valid answer for a bodyweight
   *  squat; it is not a valid answer for a loaded overhead press. */
  contraindications?: ContraindicationInput[];
  /** A DIFFERENT exercise doing the same job when the kit is missing or the
   *  movement hurts. Not the same as a progression — that is this movement
   *  made harder; this is another movement doing its work. */
  substitutions?: string[];
  /** Names of easier and harder versions of the SAME movement. This is how a
   *  plan adapts to a person instead of handing everyone the same session:
   *  a press-up regresses to knees, progresses to decline. */
  regression_of?: string | null;
  progression_to?: string | null;
  /** The subject of the demo photograph — a person mid-movement, not a room. */
  demo_image_prompt?: string | null;
}

// ─── Check results ───────────────────────────────────────────────────────────

export type ExerciseFindingKind =
  | 'equipment'        // the method uses kit the exercise does not list
  | 'no_primary'       // nothing to programme it by
  | 'no_pattern'       // cannot be balanced in a week
  | 'image_mismatch'   // the demo shows a different exercise
  | 'unsafe';          // a loaded/overhead movement with nothing said about risk

export interface ExerciseCheckFinding {
  kind: ExerciseFindingKind;
  term: string;
  message: string;
}

export interface ExerciseCheckResult {
  status: 'pass' | 'fail';
  checked_at: string;
  findings: ExerciseCheckFinding[];
}

// ─── Store contract ──────────────────────────────────────────────────────────

export interface ExerciseSnapshot {
  id: string;
  name: string;
  equipment: string[];
  muscles: Array<{ muscle: string; role: string }>;
  steps: string[];
  movement_pattern: string | null;
  difficulty: number | null;
  contraindications: Array<{ condition: string; severity: string; note?: string | null }>;
  session_role: string | null;
  /** Whether the demo shows a person performing THIS exercise, and what made
   *  it. The library's 170 images are empty gym rooms — one filed under "hack
   *  squat" is a bench press — so "has an image" means nothing on its own. */
  demo?: { exists: boolean; engine: string | null; depicts_exercise: boolean | null; outdated: boolean };
  validation?: ExerciseCheckResult;
}

export interface ExerciseMatch {
  id: string;
  name: string;
  muscles: string[];
  visible: boolean;
}

export interface ExerciseStore {
  save(exercise: ExerciseInput): Promise<{ id: string | null; error?: string }>;
  readExercise(exerciseId: string): Promise<ExerciseSnapshot | null>;
  findExercise(query: string): Promise<ExerciseMatch[]>;
  check(exercise: ExerciseInput): Promise<ExerciseCheckResult>;
  recheck(exerciseId: string): Promise<ExerciseCheckResult | null>;
  addEquipment(exerciseId: string, equipment: string): Promise<{ ok: boolean; error?: string }>;
  setMuscles(exerciseId: string, muscles: ExerciseMuscleInput[]): Promise<{ ok: boolean; error?: string }>;
  /** Re-shoot the demonstration and VERIFY it shows the right movement before
   *  keeping it. Generation alone is not enough: asked for a hack squat, the
   *  model rendered an immaculate leg press. */
  regenerateDemo(exerciseId: string, prompt: string): Promise<{ ok: boolean; engine?: string; depicts?: boolean; error?: string }>;
  proposeSeeds(brief: { muscle?: string; pattern?: string; equipment?: string; count?: number }): Promise<ExerciseSeedSuggestion[]>;
}

export interface ExerciseSeedSuggestion {
  name: string;
  movement_pattern: string;
  primary_muscle: string;
  equipment: string;
  difficulty: number;
  /** What the library is missing that this fills. The reason is the point —
   *  the gaps are real: 8 primary exercises for biceps against 75 for glutes. */
  why: string;
}

// ─── The equipment check ─────────────────────────────────────────────────────

/** Words that describe the body, not kit. "Grip with both hands" is not a
 *  missing piece of equipment. */
const BODY_WORDS = new Set([
  'hand', 'hands', 'foot', 'feet', 'leg', 'legs', 'arm', 'arms', 'knee',
  'knees', 'hip', 'hips', 'shoulder', 'shoulders', 'elbow', 'elbows', 'core',
  'chest', 'back', 'head', 'neck', 'toe', 'toes', 'heel', 'heels', 'wrist',
  'wrists', 'ankle', 'ankles', 'spine', 'glute', 'glutes', 'abs', 'palm',
  'palms', 'finger', 'fingers', 'thigh', 'thighs', 'torso', 'body',
]);

/** Furniture and surfaces every room has. Naming the floor is not a kit list. */
const AMBIENT = new Set([
  'floor', 'ground', 'wall', 'mirror', 'ceiling', 'air', 'space', 'room',
  'gym', 'mat', 'surface', 'seat', 'position', 'stance', 'grip', 'form',
  'rep', 'reps', 'set', 'sets', 'breath', 'tempo', 'range', 'motion',
]);

const EQUIPMENT_SYNONYMS: string[][] = [
  ['dumbbell', 'dumbbells', 'db'],
  ['barbell', 'bar', 'olympic'],
  ['kettlebell', 'kettlebells', 'kb'],
  ['bench', 'incline', 'decline'],
  ['band', 'bands', 'resistance'],
  ['machine', 'cable', 'pulley', 'stack'],
  ['rack', 'cage', 'squat'],
  ['box', 'plyo', 'step'],
  ['ball', 'medicine', 'slam', 'stability', 'swiss'],
  ['bodyweight', 'none', 'nothing'],
  ['pullup', 'chinup', 'bar'],
  ['rope', 'battle', 'skipping'],
  ['plate', 'plates', 'weight', 'weights'],
];

const eqGroup = new Map<string, number>();
EQUIPMENT_SYNONYMS.forEach((grp, i) => grp.forEach((w) => eqGroup.set(w, i)));

/** Strip accents so "café" and "cafe" are one word. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function equipmentWords(phrase: string): string[] {
  return fold(phrase ?? '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !BODY_WORDS.has(w) && !AMBIENT.has(w))
    .map((w) => {
      const s = w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w;
      const g = eqGroup.get(s);
      return g === undefined ? s : `eq${g}`;
    });
}

/**
 * Which pieces of kit does the method NAME that the exercise does not list?
 *
 * Same shape as findPhantomIngredients, and the same reason for existing: a
 * user filtering for "bodyweight, at home" must not be handed a movement whose
 * step three reaches for a barbell.
 */
export function findPhantomEquipment(named: string[], available: string[]): string[] {
  const covered = new Set<string>();
  for (const item of available) for (const w of equipmentWords(item)) covered.add(w);

  const phantoms: string[] = [];
  const seen = new Set<string>();
  for (const item of named) {
    const words = equipmentWords(item);
    if (!words.length) continue;
    if (words.some((w) => covered.has(w))) continue;
    const sig = words.slice().sort().join('+');
    if (seen.has(sig)) continue;
    seen.add(sig);
    phantoms.push(item);
  }
  return phantoms;
}

/** Movements where load sits over the head or the spine is loaded under a bar.
 *  Not a diagnosis — a prompt to say who should be careful and why, which is
 *  the difference between a training library and a liability. */
const RISK_HINTS = /\b(overhead|press|jerk|snatch|clean|deadlift|squat|jump|plyo|box jump|sprint|kip|handstand|bridge|inversion)\b/i;

/**
 * The full check. Deterministic, no model — the host does the reading and the
 * looking, this decides.
 */
export function checkExercise(
  exercise: {
    name: string;
    equipment: string[];
    muscles: Array<{ role: string }>;
    movement_pattern?: string | null;
    contraindications?: Array<{ condition: string }> | null;
  },
  namedEquipment: string[],
  now: string,
  opts: { imageDepictsExercise?: boolean | null } = {},
): ExerciseCheckResult {
  const findings: ExerciseCheckFinding[] = [];

  for (const term of findPhantomEquipment(namedEquipment, exercise.equipment)) {
    findings.push({
      kind: 'equipment',
      term,
      message: `The method uses "${term}" but it is not in this exercise's equipment. Someone filtering for what they own would be handed a movement they cannot do.`,
    });
  }

  if (!exercise.muscles.some((m) => m.role === 'primary')) {
    findings.push({
      kind: 'no_primary',
      term: 'primary muscle',
      message: 'No primary muscle, so no plan can ever select this exercise — it exists but is unreachable.',
    });
  }

  if (!exercise.movement_pattern) {
    findings.push({
      kind: 'no_pattern',
      term: 'movement pattern',
      message: 'No movement pattern, so a week cannot be balanced around it — muscle groups alone cannot tell a press from a hinge.',
    });
  }

  if (RISK_HINTS.test(exercise.name) && !(exercise.contraindications ?? []).length) {
    findings.push({
      kind: 'unsafe',
      term: 'contraindications',
      message: 'A loaded, overhead or high-impact movement with nothing recorded about who should avoid it.',
    });
  }

  if (opts.imageDepictsExercise === false) {
    findings.push({
      kind: 'image_mismatch',
      term: 'demo image',
      message: 'The demonstration does not show this exercise. A confident picture of the wrong movement teaches the wrong movement.',
    });
  }

  return { status: findings.length ? 'fail' : 'pass', checked_at: now, findings };
}
