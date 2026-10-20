// ─── The day's plan — what was agreed, readable by both of them ─────────────
//
// The operator and Ava plan the day together every morning. Until now that
// conversation lived in chat scrollback: gone by lunchtime, and invisible to
// her afterwards, so she could not say "the 13:00 has not gone out" or build
// tomorrow around what today did not manage.
//
// The same lesson as the health room, arrived at twice. She could create plans
// there and never see one, so she archived the plan someone was four days into
// and told them nothing was displaced. A list she cannot read is a list she
// will contradict.
//
// Surface-injected like every other store: the hub owns the rows, core owns
// the rules.

/** One planned thing. Rows sharing `group_id` are ONE STORY going out across
 *  platforms in the same slot — that is the unit the operator thinks in. */
export interface DayPlanItem {
  id: string;
  /** Local day, YYYY-MM-DD. Never derived from a UTC timestamp: a plan written
   *  at 23:50 belongs to the day it was written on. */
  plan_date: string;
  /** Local wall-clock, HH:MM. Null means "anytime today". */
  plan_time: string | null;
  title: string;
  notes: string | null;
  kind: 'post' | 'work';
  platform: string | null;
  status: 'planned' | 'done' | 'dropped' | 'carried';
  /** HOW it is known to be done. 'system' = it published itself and said so;
   *  'operator' = they said so. Never claim 'ava' for something you did not
   *  witness — that is the difference between a record and an opinion. */
  done_by: 'ava' | 'operator' | 'system' | null;
  /** Rows sharing this are one story. */
  group_id: string | null;
  /**
   * HIS mark: did this output land? true / false, null = not judged yet.
   * Never hers to set — the whole value of it is that it is not her opinion.
   */
  landed?: boolean | null;
  /**
   * HER honest verdict on her own work for this output (20 Oct 2026). Always
   * given, including when it is bad. The gap between this and `landed` is
   * what she learns from: a verdict that keeps calling posts strong that he
   * marks as flat is a judgement that needs correcting.
   */
  ava_verdict?: string | null;
}

export interface NewDayPlanItem {
  title: string;
  plan_time?: string | null;
  kind?: 'post' | 'work';
  platform?: string | null;
  notes?: string | null;
  group_id?: string | null;
}

export interface DayPlanStore {
  /** Everything planned for a local day, in time order. */
  list(date: string): Promise<DayPlanItem[]>;
  /** Add items. Returns how many landed. */
  add(date: string, items: NewDayPlanItem[]): Promise<number>;
  /** Change one item's status. Returns false when the id is unknown. */
  setStatus(
    id: string,
    status: 'planned' | 'done' | 'dropped' | 'carried',
    doneBy?: 'ava' | 'operator' | 'system' | null,
  ): Promise<boolean>;
  /**
   * Every item from `from` to `to` inclusive (local days), oldest first — the
   * fortnight view. With memory loss he cannot hold what landed two weeks
   * ago; she can, but only if she can read it. Optional: a host without it
   * says so rather than pretending the past is empty.
   */
  listRange?(from: string, to: string): Promise<DayPlanItem[]>;
  /** Record her verdict on these items. Returns how many were updated. */
  setVerdict?(ids: string[], verdict: string): Promise<number>;
}
