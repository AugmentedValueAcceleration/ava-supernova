import { t, useLocale } from '../i18n';
import { Select } from '../components/Select';

/**
 * Shared form primitives for the profile editors — used by both
 * GeneralProfilePage (identity + body basics) and HealthProfilePage (goals,
 * constraints, schedule). Extracted on 2026-06-21 when the single profile was
 * split into General + Health so the two editors share one look and the
 * unit-conversion logic (height/weight) lives in one place.
 */

// Solid background — matches the canonical dashboard input register.
// `color-scheme: dark` makes native chrome (date/number/time pickers) render
// dark instead of unreadable white-on-dark.
export const inputCls = 'w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition [color-scheme:dark]';

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[13px] font-medium text-[var(--text-primary)]">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-relaxed">{subtitle}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>;
}

// A plain <div>, NOT a <label>: a <label> forwards a click anywhere in its box
// to the first labelable control inside it, which for our custom Select/time
// pickers (buttons) meant clicking the empty space to the right of a dropdown
// popped it open. A div scopes the click to the control itself.
/** `hint` sits UNDER the control, not above it: it explains what the answer
 *  changes, which is only worth reading once you have seen the choices. */
export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`block ${className ?? ''}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">{label}</div>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function NumberInput({ value, onChange, placeholder, step }: { value: number | null; onChange: (next: number | null) => void; placeholder?: string; step?: number }) {
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

// 24h hour + 5-minute-step options for the custom time picker. Native
// <input type="time"> looked like raw browser chrome; this is built from our
// own Select so it matches the dashboard. Used by the profile schedule and
// Ava's profile-fill time cards.
const TIME_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const TIME_MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

export function TimeInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  useLocale();
  const [h, m] = value && value.includes(':') ? value.split(':') : ['', ''];
  // Keep an off-step saved minute (e.g. "23") selectable rather than dropping it.
  const minOptions = m && !TIME_MINS.includes(m) ? [...TIME_MINS, m].sort() : TIME_MINS;
  const dash = { value: '', label: t('health.fill.time_any') };
  // Both boxes are sized for the LONGEST label they can hold, not for "23:45".
  // At 88/72px the unset state truncated to "Any ti…" / "An…", which reads as a
  // broken control rather than an empty one — and the label is the only thing
  // telling you the field is optional. Equal widths because the menu is at
  // least as wide as its trigger, so unequal boxes make the pair look ragged
  // the moment either one opens.
  return (
    <div className="flex items-center gap-1.5">
      <Select
        size="sm"
        className="w-[108px]"
        value={h}
        onChange={(hh) => onChange(hh === '' ? null : `${hh}:${m || '00'}`)}
        options={[dash, ...TIME_HOURS.map((x) => ({ value: x, label: x }))]}
      />
      <span className="text-[12px] text-[var(--text-muted)]">:</span>
      <Select
        size="sm"
        className="w-[108px]"
        value={m}
        onChange={(mm) => onChange(`${h || '00'}:${mm || '00'}`)}
        options={[dash, ...minOptions.map((x) => ({ value: x, label: x }))]}
      />
    </div>
  );
}

/**
 * Height field — single source of truth is cm (matches the data shape), but the
 * operator gets three live inputs: cm, ft, and in. Typing in any one recomputes
 * the others. Rounds total inches first and normalises the carry.
 */
export function HeightField({ cm, onChange }: { cm: number | null; onChange: (cm: number | null) => void }) {
  let ft: number | null = null;
  let inches: number | null = null;
  if (cm != null && Number.isFinite(cm)) {
    const totalIn = Math.round(cm / 2.54);
    ft = Math.floor(totalIn / 12);
    inches = totalIn % 12;
  }

  const setFromImperial = (newFt: number | null, newIn: number | null) => {
    if (newFt == null && newIn == null) { onChange(null); return; }
    const totalIn = (newFt ?? 0) * 12 + (newIn ?? 0);
    onChange(Math.round(totalIn * 2.54));
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
      <div>
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">cm</div>
        <NumberInput value={cm} onChange={onChange} placeholder="178" />
      </div>
      <div className="w-16">
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">ft</div>
        <NumberInput value={ft} onChange={v => setFromImperial(v, inches)} placeholder="5" />
      </div>
      <div className="w-16">
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">in</div>
        <NumberInput value={inches} onChange={v => setFromImperial(ft, v)} placeholder="10" />
      </div>
    </div>
  );
}

/**
 * Weight field — kg is the source of truth. Operator gets four live cells: kg,
 * total lbs, and stone + lb (the UK "12 st 4 lb" format). Total pounds rounded
 * first, then split so the carry edge case can't show "5 st 14 lb".
 */
export function WeightField({ kg, onChange }: { kg: number | null; onChange: (kg: number | null) => void }) {
  let lbs: number | null = null;
  let stone: number | null = null;
  let stoneLb: number | null = null;
  if (kg != null && Number.isFinite(kg)) {
    lbs = Math.round(kg * 2.20462);
    stone = Math.floor(lbs / 14);
    stoneLb = lbs % 14;
  }

  const kgFromLbs = (totalLbs: number) => Math.round((totalLbs / 2.20462) * 10) / 10;
  const setFromLbs = (newLbs: number | null) => {
    if (newLbs == null) { onChange(null); return; }
    onChange(kgFromLbs(newLbs));
  };
  const setFromStone = (newStone: number | null, newLb: number | null) => {
    if (newStone == null && newLb == null) { onChange(null); return; }
    onChange(kgFromLbs((newStone ?? 0) * 14 + (newLb ?? 0)));
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
      <div>
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">kg</div>
        <NumberInput value={kg} onChange={onChange} placeholder="78" step={0.1} />
      </div>
      <div className="w-16">
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">lbs</div>
        <NumberInput value={lbs} onChange={setFromLbs} placeholder="172" />
      </div>
      <div className="w-14">
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">st</div>
        <NumberInput value={stone} onChange={v => setFromStone(v, stoneLb)} placeholder="12" />
      </div>
      <div className="w-14">
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">lb</div>
        <NumberInput value={stoneLb} onChange={v => setFromStone(stone, v)} placeholder="4" />
      </div>
    </div>
  );
}

export function PickerChips({ selected, options, onToggle, emptyHint }: {
  selected: string[];
  options: Array<{ slug: string; label: string }>;
  onToggle: (slug: string) => void;
  emptyHint?: string;
}) {
  useLocale();
  if (options.length === 0) {
    return <div className="text-[10px] text-[var(--text-muted)] italic">{emptyHint ?? t('health.profile.no_options')}</div>;
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
