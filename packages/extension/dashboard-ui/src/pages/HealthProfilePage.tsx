import { Fragment, useEffect, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { HealthProfile, HealthTaxonomies } from '../types/messages';
import { Section, FieldGrid, Field, NumberInput, TimeInput, PickerChips, inputCls } from './ProfilePrimitives';
import { Select } from '../components/Select';

/**
 * Profile tab on the Health page — body stats, goals, constraints,
 * schedule, privacy controls. Local-first: changes autosave to
 * VSCode globalState via the extension host. Works fully for BYOK /
 * no-account users.
 *
 * Per-category cloud sync (privacy.sync_*) layers on later; for now
 * the flags are saved but don't trigger any network activity. The
 * UI exposes them so the data model is in place.
 *
 * Aesthetic register matches the rest of the dashboard — calm,
 * generous spacing, sectioned. Health data is intimate; the form
 * should feel like a journal, not an admin panel.
 */

// Labels/hints resolved through t() at render — module consts evaluate once
// at import, so a t() call here would freeze to English. The `value` slugs are
// persisted to the profile data model and stay verbatim.
const GOAL_OPTIONS: Array<{ value: HealthProfile['goals']['primary']; labelKey: string; hintKey: string }> = [
  { value: 'fat_loss',     labelKey: 'health.profile.goal.fat_loss',    hintKey: 'health.profile.goal.fat_loss.hint' },
  { value: 'muscle_gain',  labelKey: 'health.profile.goal.muscle_gain', hintKey: 'health.profile.goal.muscle_gain.hint' },
  { value: 'maintenance',  labelKey: 'health.profile.goal.maintenance', hintKey: 'health.profile.goal.maintenance.hint' },
  { value: 'athletic',     labelKey: 'health.profile.goal.athletic',    hintKey: 'health.profile.goal.athletic.hint' },
  { value: 'recovery',     labelKey: 'health.profile.goal.recovery',    hintKey: 'health.profile.goal.recovery.hint' },
  { value: 'longevity',    labelKey: 'health.profile.goal.longevity',   hintKey: 'health.profile.goal.longevity.hint' },
];

interface Props {
  profile: HealthProfile | null;
  taxonomies: HealthTaxonomies | null;
  onSave: (next: HealthProfile) => void;
  onLoadTaxonomies: () => void;
}

export function HealthProfilePage({ profile, taxonomies, onSave, onLoadTaxonomies }: Props) {
  useLocale();
  // Local working copy — operator edits this, autosave pushes it
  // to the host on a debounce. Initial state mirrors the loaded
  // profile; resets when the profile prop changes.
  const [draft, setDraft] = useState<HealthProfile | null>(profile);
  useEffect(() => { setDraft(profile); }, [profile]);

  // 600ms debounced autosave — typing in a number field shouldn't
  // fire ten saves; pausing for half a second flushes.
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!draft || !profile) return;
    // Skip the first render (when draft === profile) — only save
    // when the operator's edits actually diverge.
    if (JSON.stringify(draft) === JSON.stringify(profile)) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(draft), 600);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [draft, profile, onSave]);

  // Lazy-load taxonomies the first time the tab opens — needed for
  // the allergen / dietary / equipment pickers below.
  useEffect(() => {
    if (!taxonomies) onLoadTaxonomies();
  }, [taxonomies, onLoadTaxonomies]);

  if (!draft) {
    return (
      <div className="py-12 text-center text-[12px] text-[var(--text-muted)]">{t('health.profile.loading')}</div>
    );
  }

  const patchGoals = (next: Partial<HealthProfile['goals']>) =>
    setDraft({ ...draft, goals: { ...draft.goals, ...next } });
  const patchConstraints = (next: Partial<HealthProfile['constraints']>) =>
    setDraft({ ...draft, constraints: { ...draft.constraints, ...next } });
  const patchSchedule = (next: Partial<HealthProfile['schedule']>) =>
    setDraft({ ...draft, schedule: { ...draft.schedule, ...next } });
  // Food section is optional on legacy profiles — default it so the controls
  // always have arrays to bind to.
  const food = draft.food ?? { likes: [], dislikes: [], cuisines: [] };
  const patchFood = (next: Partial<NonNullable<HealthProfile['food']>>) =>
    setDraft({ ...draft, food: { ...food, ...next } });

  return (
    <div className="w-full space-y-8 pb-12">
      <Intro />

      {/* Goals */}
      <Section title={t('health.profile.goals')} subtitle={t('health.profile.goals_subtitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {GOAL_OPTIONS.map(g => {
            const active = draft.goals.primary === g.value;
            return (
              <button
                key={g.value ?? 'none'}
                type="button"
                onClick={() => patchGoals({ primary: active ? null : g.value })}
                className={`text-left rounded-lg border p-3 transition cursor-pointer ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--border)] bg-transparent hover:border-[var(--accent)]/40'
                }`}
              >
                <div className={`text-[12px] font-medium ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{t(g.labelKey)}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{t(g.hintKey)}</div>
              </button>
            );
          })}
        </div>
        <Field label={t('health.profile.weekly_focus')} className="mt-3">
          <input
            type="text"
            value={draft.goals.weekly_focus ?? ''}
            onChange={e => patchGoals({ weekly_focus: e.target.value || null })}
            placeholder={t('health.profile.weekly_focus_placeholder')}
            maxLength={120}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Constraints */}
      <Section title={t('health.profile.constraints')} subtitle={t('health.profile.constraints_subtitle')}>
        <Field label={t('health.profile.allergens')}>
          <PickerChips
            selected={draft.constraints.allergens}
            options={(taxonomies?.allergens ?? []).map(a => ({ slug: a.slug, label: a.name }))}
            onToggle={slug => {
              const exists = draft.constraints.allergens.includes(slug);
              const next = exists
                ? draft.constraints.allergens.filter(s => s !== slug)
                : [...draft.constraints.allergens, slug];
              patchConstraints({ allergens: next });
            }}
            emptyHint={t('health.profile.allergens_loading')}
          />
        </Field>
        <Field label={t('health.profile.dietary')}>
          <PickerChips
            selected={draft.constraints.dietary}
            options={DEFAULT_DIETARY_OPTIONS.map(o => ({ slug: o.slug, label: t(o.labelKey) }))}
            onToggle={slug => {
              const exists = draft.constraints.dietary.includes(slug);
              const next = exists
                ? draft.constraints.dietary.filter(s => s !== slug)
                : [...draft.constraints.dietary, slug];
              patchConstraints({ dietary: next });
            }}
          />
        </Field>
        <Field label={t('health.profile.equipment')}>
          <PickerChips
            selected={draft.constraints.equipment_available}
            options={DEFAULT_EQUIPMENT_OPTIONS.map(o => ({ slug: o.slug, label: t(o.labelKey) }))}
            onToggle={slug => {
              const exists = draft.constraints.equipment_available.includes(slug);
              const next = exists
                ? draft.constraints.equipment_available.filter(s => s !== slug)
                : [...draft.constraints.equipment_available, slug];
              patchConstraints({ equipment_available: next });
            }}
          />
        </Field>
        <Field label={t('health.profile.injuries')}>
          <textarea
            rows={2}
            value={draft.constraints.injuries.join('\n')}
            onChange={e => patchConstraints({ injuries: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
            placeholder={t('health.profile.injuries_placeholder')}
            className={`${inputCls} resize-y font-[inherit]`}
          />
        </Field>
        <Field label={t('health.profile.minutes_per_day')}>
          <NumberInput
            value={draft.constraints.minutes_per_day_target}
            onChange={v => patchConstraints({ minutes_per_day_target: v })}
            placeholder="45"
          />
        </Field>
      </Section>

      {/* Food & taste — steers meal plans toward what you enjoy. */}
      <Section title={t('health.profile.food_taste')} subtitle={t('health.profile.food_taste_subtitle')}>
        <Field label={t('health.profile.likes')}>
          <textarea
            rows={2}
            value={food.likes.join('\n')}
            onChange={e => patchFood({ likes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
            placeholder={t('health.profile.likes_placeholder')}
            className={`${inputCls} resize-y font-[inherit]`}
          />
        </Field>
        <Field label={t('health.profile.dislikes')}>
          <textarea
            rows={2}
            value={food.dislikes.join('\n')}
            onChange={e => patchFood({ dislikes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
            placeholder={t('health.profile.dislikes_placeholder')}
            className={`${inputCls} resize-y font-[inherit]`}
          />
        </Field>
        <Field label={t('health.profile.cuisines')}>
          <PickerChips
            selected={food.cuisines}
            options={CUISINE_OPTIONS.map(o => ({ slug: o.slug, label: o.label }))}
            onToggle={slug => {
              const exists = food.cuisines.includes(slug);
              patchFood({ cuisines: exists ? food.cuisines.filter(s => s !== slug) : [...food.cuisines, slug] });
            }}
          />
        </Field>
      </Section>

      {/* Schedule */}
      <Section title={t('health.profile.schedule')} subtitle={t('health.profile.schedule_subtitle')}>
        <FieldGrid>
          <Field label={t('health.profile.training_start')}>
            <TimeInput value={draft.schedule.training_window.start} onChange={v => patchSchedule({ training_window: { ...draft.schedule.training_window, start: v } })} />
          </Field>
          <Field label={t('health.profile.training_end')}>
            <TimeInput value={draft.schedule.training_window.end} onChange={v => patchSchedule({ training_window: { ...draft.schedule.training_window, end: v } })} />
          </Field>
          <Field label={t('health.profile.breakfast')}>
            <TimeInput value={draft.schedule.meal_times.breakfast} onChange={v => patchSchedule({ meal_times: { ...draft.schedule.meal_times, breakfast: v } })} />
          </Field>
          <Field label={t('health.profile.lunch')}>
            <TimeInput value={draft.schedule.meal_times.lunch} onChange={v => patchSchedule({ meal_times: { ...draft.schedule.meal_times, lunch: v } })} />
          </Field>
          <Field label={t('health.profile.dinner')}>
            <TimeInput value={draft.schedule.meal_times.dinner} onChange={v => patchSchedule({ meal_times: { ...draft.schedule.meal_times, dinner: v } })} />
          </Field>
          <Field label={t('health.profile.bedtime')}>
            <TimeInput value={draft.schedule.sleep_target.bedtime} onChange={v => patchSchedule({ sleep_target: { ...draft.schedule.sleep_target, bedtime: v } })} />
          </Field>
          <Field label={t('health.profile.wake')}>
            <TimeInput value={draft.schedule.sleep_target.wake} onChange={v => patchSchedule({ sleep_target: { ...draft.schedule.sleep_target, wake: v } })} />
          </Field>
        </FieldGrid>
        <CookingTimeField value={draft.schedule.cooking_time} onChange={v => patchSchedule({ cooking_time: v })} />
      </Section>

    </div>
  );
}

// ── Cooking-time field — how long the user has to cook, set per day AND per
// meal type (Breakfast/Lunch/Dinner), each defaulting to "Any". A 7-day grid:
// rows = days, columns = meals. This per-slot granularity is the data Ava needs
// to slot the right recipe into each real meal — a quick weekday breakfast, a
// longer weekend dinner — instead of one blunt time for the whole day.
const COOK_TIERS = [
  { v: '', k: 'health.profile.cooking_any' },
  { v: '15', k: 'health.profile.cooking_15' },
  { v: '30', k: 'health.profile.cooking_30' },
  { v: '60', k: 'health.profile.cooking_60' },
  { v: '60+', k: 'health.profile.cooking_60plus' },
];
const COOK_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun, via health.plans.weekday.N
type MealKey = 'breakfast' | 'lunch' | 'dinner';
const COOK_MEALS: { m: MealKey; k: string }[] = [
  { m: 'breakfast', k: 'health.profile.breakfast' },
  { m: 'lunch', k: 'health.profile.lunch' },
  { m: 'dinner', k: 'health.profile.dinner' },
];

type MealCook = { breakfast: string | null; lunch: string | null; dinner: string | null };
type CookTime = { by_day: Record<string, MealCook> };

function CookingTimeField({ value, onChange }: { value: CookTime | undefined; onChange: (v: CookTime) => void }) {
  const cook: CookTime = value ?? { by_day: {} };
  const cellVal = (d: number, meal: MealKey) => cook.by_day[String(d)]?.[meal] ?? '';
  const setCell = (d: number, meal: MealKey, v: string) => {
    const by = { ...cook.by_day };
    const prev: MealCook = by[String(d)] ?? { breakfast: null, lunch: null, dinner: null };
    const day: MealCook = { ...prev, [meal]: v || null };
    if (!day.breakfast && !day.lunch && !day.dinner) delete by[String(d)];
    else by[String(d)] = day;
    onChange({ by_day: by });
  };
  return (
    <div className="mt-4">
      <div className="text-sm font-medium text-gray-200">{t('health.profile.cooking_time')}</div>
      <p className="mt-1 text-xs text-gray-500">{t('health.profile.cooking_time_hint')}</p>
      <div className="mt-3 grid items-center gap-x-2 gap-y-1.5" style={{ gridTemplateColumns: 'auto repeat(3, minmax(0, 1fr))' }}>
        <div />
        {COOK_MEALS.map(m => <div key={m.m} className="text-center text-[11px] text-gray-500">{t(m.k)}</div>)}
        {COOK_DAYS.map(d => (
          <Fragment key={d}>
            <div className="pr-2 text-xs text-gray-300">{t(`health.plans.weekday.${d}`)}</div>
            {COOK_MEALS.map(m => (
              <Select key={m.m} size="sm" value={cellVal(d, m.m)} onChange={v => setCell(d, m.m, v)}
                options={COOK_TIERS.map(o => ({ value: o.v, label: t(o.k) }))} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Defaults for the picker chips when the platform taxonomy isn't
// loaded yet (BYOK / offline). Kept short — the platform taxonomies
// expand these once the network call lands.

// `slug` is the persisted value (sent to plans/recipes); only the display
// label is translated, and it's resolved through t() at the render site.
const DEFAULT_DIETARY_OPTIONS = [
  { slug: 'vegan',          labelKey: 'health.profile.diet.vegan' },
  { slug: 'vegetarian',     labelKey: 'health.profile.diet.vegetarian' },
  { slug: 'pescatarian',    labelKey: 'health.profile.diet.pescatarian' },
  { slug: 'gluten_free',    labelKey: 'health.profile.diet.gluten_free' },
  { slug: 'dairy_free',     labelKey: 'health.profile.diet.dairy_free' },
  { slug: 'low_fodmap',     labelKey: 'health.profile.diet.low_fodmap' },
  { slug: 'keto',           labelKey: 'health.profile.diet.keto' },
  { slug: 'mediterranean',  labelKey: 'health.profile.diet.mediterranean' },
  { slug: 'halal',          labelKey: 'health.profile.diet.halal' },
  { slug: 'kosher',         labelKey: 'health.profile.diet.kosher' },
];

// Global cuisines for the favourites picker — single-word slugs humanise to a
// clean label, so no i18n key is needed (matches the catalogue's worldwide set).
const CUISINE_OPTIONS = [
  'italian', 'french', 'spanish', 'greek', 'mediterranean', 'indian', 'thai',
  'vietnamese', 'chinese', 'japanese', 'korean', 'mexican', 'american',
  'caribbean', 'moroccan', 'lebanese', 'turkish', 'british', 'brazilian', 'ethiopian',
].map(slug => ({ slug, label: slug.charAt(0).toUpperCase() + slug.slice(1) }));

const DEFAULT_EQUIPMENT_OPTIONS = [
  { slug: 'bodyweight',    labelKey: 'health.profile.equip.bodyweight' },
  { slug: 'dumbbells',     labelKey: 'health.profile.equip.dumbbells' },
  { slug: 'barbell',       labelKey: 'health.profile.equip.barbell' },
  { slug: 'kettlebell',    labelKey: 'health.profile.equip.kettlebell' },
  { slug: 'pull_up_bar',   labelKey: 'health.profile.equip.pull_up_bar' },
  { slug: 'bench',         labelKey: 'health.profile.equip.bench' },
  { slug: 'squat_rack',    labelKey: 'health.profile.equip.squat_rack' },
  { slug: 'cable_machine', labelKey: 'health.profile.equip.cable_machine' },
  { slug: 'rowing_machine',labelKey: 'health.profile.equip.rowing_machine' },
  { slug: 'treadmill',     labelKey: 'health.profile.equip.treadmill' },
  { slug: 'exercise_bike', labelKey: 'health.profile.equip.exercise_bike' },
  { slug: 'mat',           labelKey: 'health.profile.equip.mat' },
  { slug: 'resistance_bands', labelKey: 'health.profile.equip.resistance_bands' },
  { slug: 'foam_roller',   labelKey: 'health.profile.equip.foam_roller' },
];

// ── Layout primitives ─────────────────────────────────────────────────

function Intro() {
  useLocale();
  return (
    <div>
      <h2 className="text-[16px] font-medium text-[var(--text-primary)]">{t('health.profile.your_profile')}</h2>
      <p className="mt-1 text-[12px] text-[var(--text-muted)] leading-relaxed max-w-prose">
        {t('health.profile.intro_blurb')}
      </p>
    </div>
  );
}
