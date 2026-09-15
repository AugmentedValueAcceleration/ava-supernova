// ─── Equipment: one vocabulary, one format ───────────────────────────────────
//
// The catalogue's `equipment` table is the source of truth (slug + display
// name, joined to exercises). This file mirrors it so core — and therefore the
// extension, the IDE and the CLI — can read, render and MATCH equipment with no
// network. Local-first is not negotiable here: a plan has to be buildable on a
// train.
//
// WHY THIS EXISTS (audit, 2026-09-15). The same profile field,
// `constraints.equipment_available`, was being written in two formats:
//
//   companion ProfileView  →  the display NAME   "Resistance bands"
//   core health_profile_ask →  the SLUG          "resistance_bands"
//
// Neither was wrong on its own; there was simply no agreed format. What hid it
// was `refersToSame` in plan-pools.ts — a deliberately over-matching fuzzy
// comparison written for INJURIES, where over-matching is the safe direction
// ("a warning costs a tap, a miss costs an injury"). For equipment the trade
// inverts: over-matching does not warn anybody, it builds a plan on a machine
// they do not own. Measured consequences, pinned in web's
// tests/equipment-matching.test.ts:
//
//   - every "* machine" matched every other one, because the token "machine"
//     is shared and the tokeniser's noise list is injury words. Owning a cable
//     machine claimed a Smith machine, a hack squat, a leg curl, a pec deck.
//   - "Hip abductor machine" matched "Hip adductor machine" — opposite
//     movements, two separate catalogue rows.
//
// So: SLUGS are the stored format everywhere, names are display only, and
// matching is exact. `normaliseEquipment` migrates whatever is already on a
// user's machine — names, slugs, casing, hyphens — without asking them to
// re-enter anything.
//
// KEEPING IT IN STEP with the table: `pnpm equipment:check` in core prints any
// drift against the live DB (slug added, slug removed, name changed). It is a
// report, not a writer — the table stays the source of truth.

export interface EquipmentDef {
  /** Stored value. Never translated, never displayed raw. */
  slug: string;
  /** Canonical English display name — matches `equipment.name` in the catalogue. */
  name: string;
  /**
   * Where this kit realistically lives. Used to group the profile chips, and
   * the groundwork for per-place planning (home days vs gym days).
   */
  place: 'home' | 'gym' | 'outdoors';
  /**
   * True for kit whose LOAD can be chosen — the only ones where "add 2.5kg" is
   * a meaningful instruction, and so the only ones that will carry a range.
   */
  loadBearing?: boolean;
  /**
   * Covered by a full gym membership. `gym_full` expands to all of these, so
   * nobody has to tick fourteen machines individually.
   *
   * This is about what a gym lets you DO, not what you own. Bodyweight, a mat,
   * a foam roller, bands and a rope are all on a gym floor, and leaving them
   * out made a gym member match FEWER exercises than someone with dumbbells at
   * home — 88 against 105, caught by checking the live endpoint rather than
   * trusting the test that had pinned the wrong idea. A sandbag stays out:
   * specialist kit, not standard issue.
   */
  inFullGym?: boolean;
}

/**
 * Mirrors `public.equipment` as of 2026-09-15 (32 rows), plus `gym_full`, which
 * is ours alone: it is a statement about ACCESS, not a piece of kit, so it has
 * no exercises tagged with it and never will.
 */
export const EQUIPMENT: EquipmentDef[] = [
  // — Bodyweight and the things nearly everyone has —
  { slug: 'bodyweight',            name: 'Bodyweight',              place: 'home', inFullGym: true },
  { slug: 'mat',                   name: 'Mat',                     place: 'home', inFullGym: true },
  { slug: 'foam_roller',           name: 'Foam roller',             place: 'home', inFullGym: true },
  { slug: 'resistance_bands',      name: 'Resistance bands',        place: 'home', inFullGym: true },
  { slug: 'jump_rope',             name: 'Jump rope',               place: 'home', inFullGym: true },

  // — Free weights. These three are where progression actually happens. —
  { slug: 'dumbbells',             name: 'Dumbbells',               place: 'home', loadBearing: true, inFullGym: true },
  { slug: 'kettlebell',            name: 'Kettlebell',              place: 'home', loadBearing: true, inFullGym: true },
  { slug: 'barbell',               name: 'Barbell',                 place: 'home', loadBearing: true, inFullGym: true },
  { slug: 'weight_plate',          name: 'Weight plates',           place: 'home', loadBearing: true, inFullGym: true },

  // — Home kit —
  { slug: 'bench',                 name: 'Bench',                   place: 'home', inFullGym: true },
  { slug: 'pull_up_bar',           name: 'Pull-up bar',             place: 'home', inFullGym: true },
  { slug: 'squat_rack',            name: 'Squat rack',              place: 'home', inFullGym: true },
  { slug: 'trx_straps',            name: 'TRX / suspension straps', place: 'home', inFullGym: true },
  { slug: 'ab_wheel',              name: 'Ab wheel',                place: 'home', inFullGym: true },
  { slug: 'medicine_ball',         name: 'Medicine ball',           place: 'home', inFullGym: true },
  { slug: 'sandbag',               name: 'Sandbag',                 place: 'home', loadBearing: true },
  { slug: 'plyo_box',              name: 'Plyo box',                place: 'home', inFullGym: true },

  // — Cardio machines —
  { slug: 'treadmill',             name: 'Treadmill',               place: 'home', inFullGym: true },
  { slug: 'exercise_bike',         name: 'Exercise bike',           place: 'home', inFullGym: true },
  { slug: 'rowing_machine',        name: 'Rowing machine',          place: 'home', inFullGym: true },
  { slug: 'stair_climber',         name: 'Stair climber',           place: 'gym',  inFullGym: true },

  // — Gym floor —
  { slug: 'cable_machine',         name: 'Cable machine',           place: 'gym',  inFullGym: true },
  { slug: 'smith_machine',         name: 'Smith machine',           place: 'gym',  inFullGym: true },
  { slug: 'hack_squat_machine',    name: 'Hack squat machine',      place: 'gym',  inFullGym: true },
  { slug: 'pec_deck_machine',      name: 'Pec deck machine',        place: 'gym',  inFullGym: true },
  { slug: 'leg_extension_machine', name: 'Leg extension machine',   place: 'gym',  inFullGym: true },
  { slug: 'leg_curl_machine',      name: 'Leg curl machine',        place: 'gym',  inFullGym: true },
  { slug: 'hip_abductor_machine',  name: 'Hip abductor machine',    place: 'gym',  inFullGym: true },
  { slug: 'hip_adductor_machine',  name: 'Hip adductor machine',    place: 'gym',  inFullGym: true },
  { slug: 'battle_ropes',          name: 'Battle ropes',            place: 'gym',  inFullGym: true },
  { slug: 'sled',                  name: 'Sled',                    place: 'gym',  inFullGym: true },
  { slug: 'yoke',                  name: 'Yoke',                    place: 'gym',  inFullGym: true },

  // — Access, not kit. Expands to everything above marked inFullGym. —
  { slug: 'gym_full',              name: 'Full gym membership',     place: 'gym' },
];

export const EQUIPMENT_BY_SLUG: ReadonlyMap<string, EquipmentDef> =
  new Map(EQUIPMENT.map((e) => [e.slug, e]));

/** Every slug a full gym membership gives you. */
export const FULL_GYM_SLUGS: readonly string[] =
  EQUIPMENT.filter((e) => e.inFullGym).map((e) => e.slug);

/** Display name for a slug; falls back to the slug so nothing renders blank. */
export function equipmentName(slug: string): string {
  return EQUIPMENT_BY_SLUG.get(slug)?.name ?? slug;
}

// Lookup from a loosened form of any accepted spelling → canonical slug.
// Built once. Covers the slug itself, the display name, and the legacy plural
// or hyphenated shapes that reached disk before the format was settled.
const LOOSE_TO_SLUG: ReadonlyMap<string, string> = (() => {
  const loosen = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const m = new Map<string, string>();
  for (const e of EQUIPMENT) {
    m.set(loosen(e.slug), e.slug);
    m.set(loosen(e.name), e.slug);
  }
  // Shapes seen in the wild or plainly meant, mapped explicitly rather than by
  // more fuzz. Anything not listed here and not matching a slug or a name is
  // left ALONE rather than guessed at — see normaliseEquipment.
  const ALIASES: Record<string, string> = {
    dumbbell: 'dumbbells',
    kettlebells: 'kettlebell',
    barbells: 'barbell',
    weightplates: 'weight_plate',
    plates: 'weight_plate',
    pullupbar: 'pull_up_bar',
    chinupbar: 'pull_up_bar',
    bands: 'resistance_bands',
    resistanceband: 'resistance_bands',
    skippingrope: 'jump_rope',
    jumprope: 'jump_rope',
    trx: 'trx_straps',
    suspensiontrainer: 'trx_straps',
    yogamat: 'mat',
    exercisemat: 'mat',
    stationarybike: 'exercise_bike',
    spinbike: 'exercise_bike',
    rower: 'rowing_machine',
    gym: 'gym_full',
    fullgym: 'gym_full',
    gymmembership: 'gym_full',
  };
  for (const [k, v] of Object.entries(ALIASES)) m.set(k, v);
  return m;
})();

/**
 * One stored value → its canonical slug, or null when nothing in the
 * vocabulary claims it.
 *
 * Null rather than a guess, deliberately. A wrong slug here is worse than an
 * unrecognised one: unrecognised is visible and can be asked about, whereas a
 * confident wrong answer is how someone ends up with a plan built on a machine
 * they have never seen. That is the fault this whole change exists to remove —
 * it must not be reintroduced by a clever fallback.
 */
export function toEquipmentSlug(value: string): string | null {
  if (!value) return null;
  return LOOSE_TO_SLUG.get(value.toLowerCase().replace(/[^a-z0-9]+/g, '')) ?? null;
}

/**
 * A whole stored list → canonical slugs. Use on READ, so a profile saved in the
 * old format keeps working and quietly upgrades on the next save; nobody is
 * asked to re-enter their kit.
 *
 * Unrecognised entries are KEPT as-is rather than dropped: a value we do not
 * understand is still something the person told us, and silently deleting it
 * would make their profile smaller every time they opened it.
 */
export function normaliseEquipment(values: readonly string[] | null | undefined): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  for (const v of values) {
    const slug = toEquipmentSlug(v) ?? v.trim();
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * The slugs a person can actually train with: their list, normalised, with
 * `gym_full` expanded into the kit a gym floor gives them.
 */
export function ownedEquipmentSlugs(values: readonly string[] | null | undefined): string[] {
  const owned = normaliseEquipment(values);
  if (!owned.includes('gym_full')) return owned;
  const out = [...owned];
  for (const slug of FULL_GYM_SLUGS) if (!out.includes(slug)) out.push(slug);
  return out;
}

/**
 * Can this person do this exercise, kit-wise? EXACT slug comparison, and
 * ALL-of: 57 of the catalogue's exercises need more than one piece of kit, so
 * "has any of them" would hand someone a bench press with no bench.
 *
 * An empty PROFILE list means "not stated", never "owns nothing" — filtering on
 * it would leave a beginner with almost nothing. An empty EXERCISE list means
 * the exercise needs nothing, so anyone can do it.
 */
export function canPerformWithEquipment(
  exerciseEquipment: readonly string[] | null | undefined,
  ownedSlugs: readonly string[] | null | undefined,
): boolean {
  const need = normaliseEquipment(exerciseEquipment);
  if (need.length === 0) return true;
  const have = ownedEquipmentSlugs(ownedSlugs);
  if (have.length === 0) return true;
  return need.every((n) => have.includes(n));
}

/** What is missing for this exercise, as display names, for telling someone why. */
export function missingEquipmentNames(
  exerciseEquipment: readonly string[] | null | undefined,
  ownedSlugs: readonly string[] | null | undefined,
): string[] {
  const need = normaliseEquipment(exerciseEquipment);
  if (need.length === 0) return [];
  const have = ownedEquipmentSlugs(ownedSlugs);
  if (have.length === 0) return [];
  return need.filter((n) => !have.includes(n)).map(equipmentName);
}
