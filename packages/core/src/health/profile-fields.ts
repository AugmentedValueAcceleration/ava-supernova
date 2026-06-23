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

export type ProfileFieldControl = 'select' | 'multiselect' | 'number' | 'text' | 'date' | 'time';

export interface ProfileFieldOption {
  /** persisted slug (sent to plans/recipes) — never translated */
  value: string;
  /** i18n key for the display label; humanise `value` when absent */
  labelKey?: string;
  /** optional one-line hint (goal cards) */
  hintKey?: string;
}

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

const EQUIPMENT_OPTIONS: ProfileFieldOption[] = [
  { value: 'bodyweight',      labelKey: 'health.profile.equip.bodyweight' },
  { value: 'dumbbells',       labelKey: 'health.profile.equip.dumbbells' },
  { value: 'barbell',         labelKey: 'health.profile.equip.barbell' },
  { value: 'kettlebell',      labelKey: 'health.profile.equip.kettlebell' },
  { value: 'pull_up_bar',     labelKey: 'health.profile.equip.pull_up_bar' },
  { value: 'bench',           labelKey: 'health.profile.equip.bench' },
  { value: 'squat_rack',      labelKey: 'health.profile.equip.squat_rack' },
  { value: 'cable_machine',   labelKey: 'health.profile.equip.cable_machine' },
  { value: 'rowing_machine',  labelKey: 'health.profile.equip.rowing_machine' },
  { value: 'treadmill',       labelKey: 'health.profile.equip.treadmill' },
  { value: 'exercise_bike',   labelKey: 'health.profile.equip.exercise_bike' },
  { value: 'mat',             labelKey: 'health.profile.equip.mat' },
  { value: 'resistance_bands',labelKey: 'health.profile.equip.resistance_bands' },
  { value: 'foam_roller',     labelKey: 'health.profile.equip.foam_roller' },
];

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

const SEX_OPTIONS: ProfileFieldOption[] = [
  { value: 'female', labelKey: 'health.fill.sex.female' },
  { value: 'male',   labelKey: 'health.fill.sex.male' },
  { value: 'other',  labelKey: 'health.fill.sex.other' },
];

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
  injuries:      { target: 'health', path: 'constraints.injuries',             control: 'text',        labelKey: 'health.fill.field.injuries', multiline: true, asArray: true },
  minutes_per_day: { target: 'health', path: 'constraints.minutes_per_day_target', control: 'number',  labelKey: 'health.fill.field.minutes',  unit: 'min' },

  // — Schedule (when they train / eat) — 24h "HH:MM" —
  training_start: { target: 'health', path: 'schedule.training_window.start', control: 'time', labelKey: 'health.fill.field.training_start' },
  training_end:   { target: 'health', path: 'schedule.training_window.end',   control: 'time', labelKey: 'health.fill.field.training_end' },
  breakfast_time: { target: 'health', path: 'schedule.meal_times.breakfast',  control: 'time', labelKey: 'health.fill.field.breakfast' },
  lunch_time:     { target: 'health', path: 'schedule.meal_times.lunch',      control: 'time', labelKey: 'health.fill.field.lunch' },
  dinner_time:    { target: 'health', path: 'schedule.meal_times.dinner',     control: 'time', labelKey: 'health.fill.field.dinner' },
};

export const HEALTH_PROFILE_FIELD_IDS = Object.keys(HEALTH_PROFILE_FIELDS);

/** Humanise a slug for display when no i18n label exists ("tree_nuts" → "Tree nuts"). */
export function humaniseSlug(slug: string): string {
  const s = slug.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
