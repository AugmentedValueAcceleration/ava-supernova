import { useEffect, useRef, useState } from 'react';
import type { HealthProfile, HealthTaxonomies } from '../types/messages';
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

const GOAL_OPTIONS: Array<{ value: HealthProfile['goals']['primary']; label: string; hint: string }> = [
  { value: 'fat_loss',     label: 'Fat loss',         hint: 'Calorie deficit, preserve muscle' },
  { value: 'muscle_gain',  label: 'Muscle gain',      hint: 'Calorie surplus, progressive overload' },
  { value: 'maintenance',  label: 'Maintenance',      hint: 'Hold current composition, sustain energy' },
  { value: 'athletic',     label: 'Athletic',         hint: 'Sport-specific, performance over aesthetics' },
  { value: 'recovery',     label: 'Recovery',         hint: 'Healing from injury / illness / burnout' },
  { value: 'longevity',    label: 'Longevity',        hint: 'Strength + mobility + cardiovascular health' },
];

const SEX_OPTIONS: Array<{ value: HealthProfile['body']['sex']; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other / prefer not to say' },
];

interface Props {
  profile: HealthProfile | null;
  taxonomies: HealthTaxonomies | null;
  onSave: (next: HealthProfile) => void;
  onLoadTaxonomies: () => void;
}

export function HealthProfilePage({ profile, taxonomies, onSave, onLoadTaxonomies }: Props) {
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
      <div className="py-12 text-center text-[12px] text-[var(--text-muted)]">Loading your profile…</div>
    );
  }

  const patchBody = (next: Partial<HealthProfile['body']>) =>
    setDraft({ ...draft, body: { ...draft.body, ...next } });
  const patchGoals = (next: Partial<HealthProfile['goals']>) =>
    setDraft({ ...draft, goals: { ...draft.goals, ...next } });
  const patchConstraints = (next: Partial<HealthProfile['constraints']>) =>
    setDraft({ ...draft, constraints: { ...draft.constraints, ...next } });
  const patchSchedule = (next: Partial<HealthProfile['schedule']>) =>
    setDraft({ ...draft, schedule: { ...draft.schedule, ...next } });

  return (
    <div className="max-w-2xl space-y-8 pb-12">
      <Intro />

      {/* Body */}
      <Section title="Body" subtitle="What Ava reads to scale plans and nutrition targets to you.">
        <FieldGrid>
          <Field label="Sex">
            <Select
              value={draft.body.sex ?? ''}
              onChange={v => patchBody({ sex: (v as HealthProfile['body']['sex']) || null })}
              options={[{ value: '', label: '—' }, ...SEX_OPTIONS.map(o => ({ value: o.value as string, label: o.label }))]}
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              value={draft.body.date_of_birth ?? ''}
              onChange={e => patchBody({ date_of_birth: e.target.value || null })}
              className={inputCls}
            />
          </Field>
          <Field label="Height (cm)">
            <NumberInput
              value={draft.body.height_cm}
              onChange={v => patchBody({ height_cm: v })}
              placeholder="178"
            />
          </Field>
          <Field label="Weight (kg)">
            <NumberInput
              value={draft.body.weight_kg}
              onChange={v => patchBody({ weight_kg: v })}
              placeholder="78"
              step={0.1}
            />
          </Field>
          <Field label="Body fat % (optional)">
            <NumberInput
              value={draft.body.body_fat_pct}
              onChange={v => patchBody({ body_fat_pct: v })}
              placeholder="—"
              step={0.1}
            />
          </Field>
        </FieldGrid>
      </Section>

      {/* Goals */}
      <Section title="Goals" subtitle="The shape of what you're working toward. Ava biases plans this way.">
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
                <div className={`text-[12px] font-medium ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{g.label}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{g.hint}</div>
              </button>
            );
          })}
        </div>
        <Field label="Weekly focus (optional)" className="mt-3">
          <input
            type="text"
            value={draft.goals.weekly_focus ?? ''}
            onChange={e => patchGoals({ weekly_focus: e.target.value || null })}
            placeholder="e.g. deload week / shoulder rehab / event prep"
            maxLength={120}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Constraints */}
      <Section title="Constraints" subtitle="Allergens, injuries, what you've got to train with, how much time you can give it.">
        <Field label="Allergens">
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
            emptyHint="Loading allergen list…"
          />
        </Field>
        <Field label="Dietary preferences">
          <PickerChips
            selected={draft.constraints.dietary}
            options={DEFAULT_DIETARY_OPTIONS}
            onToggle={slug => {
              const exists = draft.constraints.dietary.includes(slug);
              const next = exists
                ? draft.constraints.dietary.filter(s => s !== slug)
                : [...draft.constraints.dietary, slug];
              patchConstraints({ dietary: next });
            }}
          />
        </Field>
        <Field label="Equipment available">
          <PickerChips
            selected={draft.constraints.equipment_available}
            options={DEFAULT_EQUIPMENT_OPTIONS}
            onToggle={slug => {
              const exists = draft.constraints.equipment_available.includes(slug);
              const next = exists
                ? draft.constraints.equipment_available.filter(s => s !== slug)
                : [...draft.constraints.equipment_available, slug];
              patchConstraints({ equipment_available: next });
            }}
          />
        </Field>
        <Field label="Current injuries / limitations">
          <textarea
            rows={2}
            value={draft.constraints.injuries.join('\n')}
            onChange={e => patchConstraints({ injuries: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
            placeholder="One per line — e.g. left shoulder impingement, lower back flare-up"
            className={`${inputCls} resize-y font-[inherit]`}
          />
        </Field>
        <Field label="Time per day target (minutes)">
          <NumberInput
            value={draft.constraints.minutes_per_day_target}
            onChange={v => patchConstraints({ minutes_per_day_target: v })}
            placeholder="45"
          />
        </Field>
      </Section>

      {/* Schedule */}
      <Section title="Schedule" subtitle="When your day runs. Ava slots plans into your windows, not a default.">
        <FieldGrid>
          <Field label="Training window — start">
            <TimeInput value={draft.schedule.training_window.start} onChange={v => patchSchedule({ training_window: { ...draft.schedule.training_window, start: v } })} />
          </Field>
          <Field label="Training window — end">
            <TimeInput value={draft.schedule.training_window.end} onChange={v => patchSchedule({ training_window: { ...draft.schedule.training_window, end: v } })} />
          </Field>
          <Field label="Breakfast">
            <TimeInput value={draft.schedule.meal_times.breakfast} onChange={v => patchSchedule({ meal_times: { ...draft.schedule.meal_times, breakfast: v } })} />
          </Field>
          <Field label="Lunch">
            <TimeInput value={draft.schedule.meal_times.lunch} onChange={v => patchSchedule({ meal_times: { ...draft.schedule.meal_times, lunch: v } })} />
          </Field>
          <Field label="Dinner">
            <TimeInput value={draft.schedule.meal_times.dinner} onChange={v => patchSchedule({ meal_times: { ...draft.schedule.meal_times, dinner: v } })} />
          </Field>
          <Field label="Bedtime">
            <TimeInput value={draft.schedule.sleep_target.bedtime} onChange={v => patchSchedule({ sleep_target: { ...draft.schedule.sleep_target, bedtime: v } })} />
          </Field>
          <Field label="Wake">
            <TimeInput value={draft.schedule.sleep_target.wake} onChange={v => patchSchedule({ sleep_target: { ...draft.schedule.sleep_target, wake: v } })} />
          </Field>
        </FieldGrid>
      </Section>

    </div>
  );
}

// ── Defaults for the picker chips when the platform taxonomy isn't
// loaded yet (BYOK / offline). Kept short — the platform taxonomies
// expand these once the network call lands.

const DEFAULT_DIETARY_OPTIONS = [
  { slug: 'vegan',          label: 'Vegan' },
  { slug: 'vegetarian',     label: 'Vegetarian' },
  { slug: 'pescatarian',    label: 'Pescatarian' },
  { slug: 'gluten_free',    label: 'Gluten-free' },
  { slug: 'dairy_free',     label: 'Dairy-free' },
  { slug: 'low_fodmap',     label: 'Low FODMAP' },
  { slug: 'keto',           label: 'Keto' },
  { slug: 'mediterranean',  label: 'Mediterranean' },
  { slug: 'halal',          label: 'Halal' },
  { slug: 'kosher',         label: 'Kosher' },
];

const DEFAULT_EQUIPMENT_OPTIONS = [
  { slug: 'bodyweight',    label: 'Bodyweight only' },
  { slug: 'dumbbells',     label: 'Dumbbells' },
  { slug: 'barbell',       label: 'Barbell + plates' },
  { slug: 'kettlebell',    label: 'Kettlebell' },
  { slug: 'pull_up_bar',   label: 'Pull-up bar' },
  { slug: 'bench',         label: 'Bench' },
  { slug: 'squat_rack',    label: 'Squat rack' },
  { slug: 'cable_machine', label: 'Cable machine' },
  { slug: 'rowing_machine',label: 'Rowing machine' },
  { slug: 'treadmill',     label: 'Treadmill' },
  { slug: 'exercise_bike', label: 'Exercise bike' },
  { slug: 'mat',           label: 'Yoga mat' },
  { slug: 'resistance_bands', label: 'Resistance bands' },
  { slug: 'foam_roller',   label: 'Foam roller' },
];

// ── Layout primitives ─────────────────────────────────────────────────

function Intro() {
  return (
    <div>
      <h2 className="text-[16px] font-medium text-[var(--text-primary)]">Your profile</h2>
      <p className="mt-1 text-[12px] text-[var(--text-muted)] leading-relaxed max-w-prose">
        What Ava reads to scale plans, recipes, and training to you. Everything autosaves locally — works fully without an account.
        Sync any category to the cloud only if you want it on other devices.
      </p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[13px] font-medium text-[var(--text-primary)]">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-relaxed">{subtitle}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">{label}</div>
      {children}
    </label>
  );
}

// Solid background — matches the canonical dashboard input register.
// Transparent reads as "empty" against the dark dashboard surface.
const inputCls = 'w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition';

function NumberInput({ value, onChange, placeholder, step }: { value: number | null; onChange: (next: number | null) => void; placeholder?: string; step?: number }) {
  return (
    <input
      type="number"
      step={step ?? 1}
      value={value ?? ''}
      onChange={e => {
        const v = e.target.value.trim();
        onChange(v === '' ? null : Number(v));
      }}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

function TimeInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input
      type="time"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className={inputCls}
    />
  );
}

function PickerChips({ selected, options, onToggle, emptyHint }: {
  selected: string[];
  options: Array<{ slug: string; label: string }>;
  onToggle: (slug: string) => void;
  emptyHint?: string;
}) {
  if (options.length === 0) {
    return <div className="text-[10px] text-[var(--text-muted)] italic">{emptyHint ?? 'No options available'}</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = selected.includes(o.slug);
        return (
          <button
            key={o.slug}
            type="button"
            onClick={() => onToggle(o.slug)}
            className={`rounded-full border px-2.5 py-1 text-[10px] transition cursor-pointer ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

