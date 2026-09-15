// ─── Health profile fields — the fill-in registry ────────────────────────────
//
// One source of truth for the "Ava fills your profile" flow. When the health
// room's profile is thin, Ava calls `health_profile_ask({ field })` for a gap;
// the host renders the matching control (the SAME controls as the profile page)
// and, on answer, saves the value to the right store. This registry is what
// links the three: the tool's `field` enum, the card's control, and the save
// target/path.
//
// Lives in core so the extension host, the IDE sidecar, and both webviews share
// exactly one definition — no drift between "what Ava can ask", "what the card
// renders", and "where it saves".

import { EQUIPMENT } from './equipment.js';

export type ProfileFieldControl = 'select' | 'multiselect' | 'number' | 'text' | 'date' | 'time' | 'cooking_grid' | 'load_range';

export interface ProfileFieldOption {
  /** persisted slug (sent to plans/recipes) — never translated */
  value: string;
  /** i18n key for the display label; humanise `value` when absent */
  labelKey?: string;
  /**
   * Canonical English label, used when there is no i18n key yet. Beats
   * humanising the slug for anything whose slug does not read as English:
   * `gym_full` humanises to "Gym full", which is not what it means.
   */
  label?: string;
  /** optional one-line hint (goal cards) */
  hintKey?: string;
}

/** The kit whose load is chosen, in the order the questions should come. */
const LOAD_BEARING_SLUGS: string[] = EQUIPMENT.filter((e) => e.loadBearing).map((e) => e.slug);

export interface ProfileFieldDef {
  /** which local store the value lands in */
  target: 'general' | 'health';
  /** dot-path within that store's object (e.g. "goals.primary") */
  path: string;
  control: ProfileFieldControl;
  /** i18n key for the field's short caption (the card title under Ava's question) */
  labelKey: string;
  /** select / multiselect choices */
  options?: ProfileFieldOption[];
  /** number suffix (cm, kg, min) */
  unit?: string;
  /** text that persists as string[] (one entry per line) — injuries */
  asArray?: boolean;
  /** render the text control as a multiline box */
  multiline?: boolean;
  /**
   * `load_range` only — which piece of kit this asks about, so the card can
   * name it ("How heavy do your dumbbells go?") instead of asking about
   * "equipment" in the abstract.
   */
  loadSlug?: string;
}

// Curated defaults mirror the profile page's chip lists (HealthProfilePage.tsx).
// The full profile page swaps in the live platform taxonomy; the fill card uses
// these common slugs so it works offline / BYOK and stays consistent.
const DIETARY_OPTIONS: ProfileFieldOption[] = [
  { value: 'vegan',          labelKey: 'health.profile.diet.vegan' },
  { value: 'vegetarian',     labelKey: 'health.profile.diet.vegetarian' },
  { value: 'pescatarian',    labelKey: 'health.profile.diet.pescatarian' },
  { value: 'gluten_free',    labelKey: 'health.profile.diet.gluten_free' },
  { value: 'dairy_free',     labelKey: 'health.profile.diet.dairy_free' },
  { value: 'low_fodmap',     labelKey: 'health.profile.diet.low_fodmap' },
  { value: 'keto',           labelKey: 'health.profile.diet.keto' },
  { value: 'mediterranean',  labelKey: 'health.profile.diet.mediterranean' },
  { value: 'halal',          labelKey: 'health.profile.diet.halal' },
  { value: 'kosher',         labelKey: 'health.profile.diet.kosher' },
];

// DERIVED from the equipment vocabulary, not typed out beside it. It used to be
// a hand-kept list of 14 while the catalogue knew 30 — so sixteen kinds of kit
// existed on exercises that nobody could say they owned, and two chips
// (treadmill, foam roller) were offered while matching no exercise at all.
// Deriving means the chips and the catalogue cannot drift apart again.
//
// Display labels come from the vocabulary's canonical English name. `labelKey`
// is set where an i18n key already exists, so translated chips keep their
// translation; the rest fall back to the name, which beats an untranslated key.

// The equipment i18n keys that already exist (the original 14). Anything added
// since renders its canonical English name until a key is written for it — an
// English word beats a raw `health.profile.equip.*` key on screen.
const LEGACY_EQUIPMENT_LABEL_KEYS: Record<string, string | undefined> = {
  bodyweight: 'health.profile.equip.bodyweight',
  dumbbells: 'health.profile.equip.dumbbells',
  barbell: 'health.profile.equip.barbell',
  kettlebell: 'health.profile.equip.kettlebell',
  pull_up_bar: 'health.profile.equip.pull_up_bar',
  bench: 'health.profile.equip.bench',
  squat_rack: 'health.profile.equip.squat_rack',
  cable_machine: 'health.profile.equip.cable_machine',
  rowing_machine: 'health.profile.equip.rowing_machine',
  treadmill: 'health.profile.equip.treadmill',
  exercise_bike: 'health.profile.equip.exercise_bike',
  mat: 'health.profile.equip.mat',
  resistance_bands: 'health.profile.equip.resistance_bands',
  foam_roller: 'health.profile.equip.foam_roller',
};

const EQUIPMENT_OPTIONS: ProfileFieldOption[] = EQUIPMENT.map((e) => ({
  value: e.slug,
  labelKey: LEGACY_EQUIPMENT_LABEL_KEYS[e.slug],
  label: e.name,
}));

const GOAL_OPTIONS: ProfileFieldOption[] = [
  { value: 'fat_loss',    labelKey: 'health.profile.goal.fat_loss',    hintKey: 'health.profile.goal.fat_loss.hint' },
  { value: 'muscle_gain', labelKey: 'health.profile.goal.muscle_gain', hintKey: 'health.profile.goal.muscle_gain.hint' },
  { value: 'maintenance', labelKey: 'health.profile.goal.maintenance', hintKey: 'health.profile.goal.maintenance.hint' },
  { value: 'athletic',    labelKey: 'health.profile.goal.athletic',    hintKey: 'health.profile.goal.athletic.hint' },
  { value: 'recovery',    labelKey: 'health.profile.goal.recovery',    hintKey: 'health.profile.goal.recovery.hint' },
  { value: 'longevity',   labelKey: 'health.profile.goal.longevity',   hintKey: 'health.profile.goal.longevity.hint' },
];

// Common allergens — humanised from the slug (no i18n key); the full profile
// page exposes the complete platform allergen taxonomy.
const ALLERGEN_OPTIONS: ProfileFieldOption[] = [
  'peanuts', 'tree_nuts', 'milk', 'eggs', 'fish', 'shellfish',
  'soy', 'wheat', 'gluten', 'sesame', 'mustard', 'celery',
].map((value) => ({ value }));

const EXPERIENCE_OPTIONS: ProfileFieldOption[] = [
  { value: 'beginner',     labelKey: 'health.profile.level.beginner' },
  { value: 'intermediate', labelKey: 'health.profile.level.intermediate' },
  { value: 'advanced',     labelKey: 'health.profile.level.advanced' },
];

// Deliberately the same values as `recipe_versions.level`, so this picks the
// right VERSION of a recipe rather than filtering which recipes are offered.
const COOKING_LEVEL_OPTIONS: ProfileFieldOption[] = [
  { value: 'beginner',     labelKey: 'health.profile.level.beginner' },
  { value: 'intermediate', labelKey: 'health.profile.level.intermediate' },
  { value: 'expert',       labelKey: 'health.profile.level.expert' },
];

// Stored Mon-first as three-letter slugs (the companion's `Weekday`), which is
// NOT the 0–6 Sun-first keying the cooking grid uses. Two different fields, two
// different shapes already on disk — converging them would rewrite live data.
const WEEKDAY_OPTIONS: ProfileFieldOption[] = [
  { value: 'mon', labelKey: 'health.plans.weekday.1' },
  { value: 'tue', labelKey: 'health.plans.weekday.2' },
  { value: 'wed', labelKey: 'health.plans.weekday.3' },
  { value: 'thu', labelKey: 'health.plans.weekday.4' },
  { value: 'fri', labelKey: 'health.plans.weekday.5' },
  { value: 'sat', labelKey: 'health.plans.weekday.6' },
  { value: 'sun', labelKey: 'health.plans.weekday.0' },
];

const SEX_OPTIONS: ProfileFieldOption[] = [
  { value: 'female', labelKey: 'health.fill.sex.female' },
  { value: 'male',   labelKey: 'health.fill.sex.male' },
  { value: 'other',  labelKey: 'health.fill.sex.other' },
];

// Global cuisines — favourites focus the catalogue's worldwide recipes. Single-
// word slugs humanise cleanly (no i18n key needed), like the allergen list.
const CUISINE_OPTIONS: ProfileFieldOption[] = [
  'italian', 'french', 'spanish', 'greek', 'mediterranean', 'indian', 'thai',
  'vietnamese', 'chinese', 'japanese', 'korean', 'mexican', 'american',
  'caribbean', 'moroccan', 'lebanese', 'turkish', 'british', 'brazilian', 'ethiopian',
].map((value) => ({ value }));

export const HEALTH_PROFILE_FIELDS: Record<string, ProfileFieldDef> = {
  // — General (identity / body, account-level) —
  sex:           { target: 'general', path: 'sex',           control: 'select', labelKey: 'health.fill.field.sex',    options: SEX_OPTIONS },
  date_of_birth: { target: 'general', path: 'date_of_birth', control: 'date',   labelKey: 'health.fill.field.dob' },
  height_cm:     { target: 'general', path: 'height_cm',     control: 'number', labelKey: 'health.fill.field.height', unit: 'cm' },
  weight_kg:     { target: 'general', path: 'weight_kg',     control: 'number', labelKey: 'health.fill.field.weight', unit: 'kg' },

  // — Health (goals / constraints) —
  goal:          { target: 'health', path: 'goals.primary',                    control: 'select',      labelKey: 'health.fill.field.goal',      options: GOAL_OPTIONS },
  weekly_focus:  { target: 'health', path: 'goals.weekly_focus',               control: 'text',        labelKey: 'health.fill.field.weekly_focus' },
  allergens:     { target: 'health', path: 'constraints.allergens',            control: 'multiselect', labelKey: 'health.fill.field.allergens', options: ALLERGEN_OPTIONS },
  dietary:       { target: 'health', path: 'constraints.dietary',              control: 'multiselect', labelKey: 'health.fill.field.dietary',   options: DIETARY_OPTIONS },
  equipment:     { target: 'health', path: 'constraints.equipment_available',  control: 'multiselect', labelKey: 'health.fill.field.equipment', options: EQUIPMENT_OPTIONS },
  // Only asked when they have a gym membership, and only to answer "is the
  // squat rack available on a Sunday?". Left empty it means "not stated",
  // which is treated as available — never as "never".
  gym_days:      { target: 'health', path: 'constraints.gym_days',             control: 'multiselect', labelKey: 'health.fill.field.gym_days',   options: WEEKDAY_OPTIONS },
  // One field per load-bearing kind rather than a single "loads" field,
  // because the registry links a field to ONE path and the answer is per
  // piece of kit. setByPath builds the intermediate objects, so
  // constraints.equipment_loads.dumbbells writes cleanly into a profile that
  // has never held one.
  //
  // These are the only fields whose answer changes what a WEIGHT INSTRUCTION
  // may say — everything else about equipment is a yes or no. Ava asks for one
  // only when loadDetailGaps names it, so a pull-up bar is never involved.
  ...Object.fromEntries(
    LOAD_BEARING_SLUGS.map((slug) => [
      `${slug}_load`,
      {
        target: 'health' as const,
        path: `constraints.equipment_loads.${slug}`,
        control: 'load_range' as const,
        labelKey: 'health.fill.field.load_range',
        loadSlug: slug,
      },
    ]),
  ),
  injuries:      { target: 'health', path: 'constraints.injuries',             control: 'text',        labelKey: 'health.fill.field.injuries', multiline: true, asArray: true },
  minutes_per_day: { target: 'health', path: 'constraints.minutes_per_day_target', control: 'number',  labelKey: 'health.fill.field.minutes',  unit: 'min' },

  // — Food & taste (steers meal plans) —
  likes:         { target: 'health', path: 'food.likes',     control: 'text',        labelKey: 'health.fill.field.likes',    multiline: true, asArray: true },
  dislikes:      { target: 'health', path: 'food.dislikes',  control: 'text',        labelKey: 'health.fill.field.dislikes', multiline: true, asArray: true },
  cuisines:      { target: 'health', path: 'food.cuisines',  control: 'multiselect', labelKey: 'health.fill.field.cuisines', options: CUISINE_OPTIONS },

  // — Schedule (when they train / eat) — 24h "HH:MM" —
  training_start: { target: 'health', path: 'schedule.training_window.start', control: 'time', labelKey: 'health.fill.field.training_start' },
  training_end:   { target: 'health', path: 'schedule.training_window.end',   control: 'time', labelKey: 'health.fill.field.training_end' },
  breakfast_time: { target: 'health', path: 'schedule.meal_times.breakfast',  control: 'time', labelKey: 'health.fill.field.breakfast' },
  lunch_time:     { target: 'health', path: 'schedule.meal_times.lunch',      control: 'time', labelKey: 'health.fill.field.lunch' },
  dinner_time:    { target: 'health', path: 'schedule.meal_times.dinner',     control: 'time', labelKey: 'health.fill.field.dinner' },

  // How long they have to cook, per day AND per meal — a 7×3 grid (the composite
  // control). One card gathers the lot; the host renders the SAME grid as the
  // profile page and saves the whole { by_day } object. See summariseCookingTime.
  cooking_time:   { target: 'health', path: 'schedule.cooking_time',          control: 'cooking_grid', labelKey: 'health.fill.field.cooking_time' },

  // — Training & kitchen —
  // These reached the web generate routes long before Ava could ask for them,
  // so a gap here was silently planned around rather than turned into a
  // question. `training_days` is which days, not how many: `days_per_week`
  // sizes the week and this one places it.
  experience:     { target: 'health', path: 'training.experience',    control: 'select',      labelKey: 'health.fill.field.experience',     options: EXPERIENCE_OPTIONS },
  days_per_week:  { target: 'health', path: 'training.days_per_week', control: 'number',      labelKey: 'health.fill.field.days_per_week' },
  training_days:  { target: 'health', path: 'training.training_days', control: 'multiselect', labelKey: 'health.fill.field.training_days',   options: WEEKDAY_OPTIONS },
  cooking_level:  { target: 'health', path: 'kitchen.level',          control: 'select',      labelKey: 'health.fill.field.cooking_level',   options: COOKING_LEVEL_OPTIONS },
  household:      { target: 'health', path: 'kitchen.household_size', control: 'number',      labelKey: 'health.fill.field.household' },
};

export const HEALTH_PROFILE_FIELD_IDS = Object.keys(HEALTH_PROFILE_FIELDS);

/** Humanise a slug for display when no i18n label exists ("tree_nuts" → "Tree nuts"). */
/**
 * Label for one option: the translation if there is a key, then the canonical
 * English name, then the humanised slug. Shared so the two ProfileFieldCards
 * cannot disagree about what a chip says.
 */
export function optionLabel(
  o: { value: string; labelKey?: string; label?: string },
  translate: (key: string) => string,
): string {
  if (o.labelKey) return translate(o.labelKey);
  return o.label ?? humaniseSlug(o.value);
}

export function humaniseSlug(slug: string): string {
  const s = slug.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Cooking-time grid → compact prompt line ─────────────────────────────────
//
// The grid is 7 days × 3 meals (21 cells), almost all "Any". Dumping every cell
// would bloat the prompt, so we collapse it: only non-default slots, and
// consecutive display-order days that share an identical meal-triple fold into a
// range. Shared by the extension host AND the IDE sidecar so the two profile
// summaries can never drift. English / model-facing.

type MealCook = { breakfast: string | null; lunch: string | null; dinner: string | null };
export type CookingTime = { by_day: Record<string, MealCook> };

const COOK_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // index = day key 0–6
const COOK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun
const COOK_MEAL_ORDER: (keyof MealCook)[] = ['breakfast', 'lunch', 'dinner'];

/** A single tier → its compact label ('15'→'≤15', '60+'→'60+'). */
function cookTierLabel(tier: string): string {
  return tier === '60+' ? '60+' : `≤${tier}`;
}

/** Per-day "breakfast ≤15, lunch ≤30" from its set meal tiers, or '' if none set. */
function cookDaySignature(day: MealCook | undefined): string {
  if (!day) return '';
  const parts: string[] = [];
  for (const meal of COOK_MEAL_ORDER) {
    const tier = day[meal];
    if (tier) parts.push(`${meal} ${cookTierLabel(tier)}`);
  }
  return parts.join(', ');
}

/**
 * Compact, model-facing summary of the cooking-time grid, or null when nothing
 * is set. e.g. "Cooking time (max minutes per meal; unset = no limit): Mon–Fri
 * breakfast ≤15, lunch ≤30, dinner ≤30; Sat–Sun dinner 60+."
 */
export function summariseCookingTime(cookTime: CookingTime | undefined | null): string | null {
  const byDay = cookTime?.by_day;
  if (!byDay) return null;

  // Walk Mon→Sun, folding into a run only when days are BOTH adjacent in the
  // display order AND share a signature — an unset day in between breaks the run
  // (so "Mon–Thu" never implies a constrained Tue/Wed).
  const groups: { days: number[]; sig: string }[] = [];
  let lastIdx = -2;
  for (let i = 0; i < COOK_DISPLAY_ORDER.length; i++) {
    const d = COOK_DISPLAY_ORDER[i];
    const sig = cookDaySignature(byDay[String(d)]);
    if (!sig) continue; // day with no constraints — skip, and leave a gap
    const last = groups[groups.length - 1];
    if (last && last.sig === sig && i === lastIdx + 1) last.days.push(d);
    else groups.push({ days: [d], sig });
    lastIdx = i;
  }
  if (!groups.length) return null;

  const segments = groups.map((g) => {
    const label = g.days.length === 1
      ? COOK_DAY_NAMES[g.days[0]]
      : `${COOK_DAY_NAMES[g.days[0]]}–${COOK_DAY_NAMES[g.days[g.days.length - 1]]}`;
    return `${label} ${g.sig}`;
  });
  return `Cooking time (max minutes per meal; unset = no limit): ${segments.join('; ')}.`;
}
