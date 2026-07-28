// PORTED FROM THE COMPANION, 28 Jul. Lives in core so the extension dashboard
// and the IDE read the SAME logic — the two surfaces are meant to be identical,
// and a third copy of a 400-line classifier is how that stops being true.
//
// Core holds no HealthProfile by design (see types.ts), so where the companion
// passed a profile these take the kitchen numbers they actually used.
//

export type DayType = 'weekday' | 'weekend';

/** Saturday and Sunday are the long-cook days for most people. Deliberately a
 *  simple rule rather than a setting: shift workers set both budgets the same
 *  and lose nothing by it. */
export function dayTypeFor(dateIso: string): DayType {
  const d = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

/** The two numbers anything time-aware actually needs off a profile. Null is
 *  UNKNOWN, never zero — nothing is called heavy against a budget nobody gave. */
export interface KitchenBudget {
  minutes_weekday?: number | null;
  minutes_weekend?: number | null;
}

export function budgetFor(kitchen: KitchenBudget | null | undefined, dayType: DayType): number | null {
  const v = dayType === 'weekend' ? kitchen?.minutes_weekend : kitchen?.minutes_weekday;
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}
