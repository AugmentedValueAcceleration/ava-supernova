import { Fragment } from 'react';
import { t } from '../i18n';
import { Select } from './Select';

// Cooking-time grid — how long the user has to cook, set per day AND per meal
// type (Breakfast/Lunch/Dinner), each defaulting to "Any". A 7-day grid: rows =
// days, columns = meals. This per-slot granularity is the data Ava needs to slot
// the right recipe into each real meal — a quick weekday breakfast, a longer
// weekend dinner. Shared by the profile page and the Health-room fill card so
// the two are always identical.

export const COOK_TIERS = [
  { v: '', k: 'health.profile.cooking_any' },
  { v: '15', k: 'health.profile.cooking_15' },
  { v: '30', k: 'health.profile.cooking_30' },
  { v: '60', k: 'health.profile.cooking_60' },
  { v: '60+', k: 'health.profile.cooking_60plus' },
];
const COOK_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun, via health.plans.weekday.N
export type MealKey = 'breakfast' | 'lunch' | 'dinner';
const COOK_MEALS: { m: MealKey; k: string }[] = [
  { m: 'breakfast', k: 'health.profile.breakfast' },
  { m: 'lunch', k: 'health.profile.lunch' },
  { m: 'dinner', k: 'health.profile.dinner' },
];

export type MealCook = { breakfast: string | null; lunch: string | null; dinner: string | null };
export type CookTime = { by_day: Record<string, MealCook> };

/** The bare 7×3 grid (no title/hint). value keyed '0'–'6' (Sun–Sat). */
export function CookingTimeGrid({ value, onChange }: { value: CookTime | undefined; onChange: (v: CookTime) => void }) {
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
    <div className="grid items-center gap-x-2 gap-y-1.5" style={{ gridTemplateColumns: 'auto repeat(3, minmax(0, 1fr))' }}>
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
  );
}
