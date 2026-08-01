// Usage stats — accumulated per CALENDAR MONTH, shared between AvaViewProvider
// and DashboardPanel.
//
// This used to be a session counter held purely in memory. It was rebuilt at
// module load, so every window reload wiped it, and the Usage tab looked like
// it had never recorded anything. It had — the numbers just did not survive
// long enough to be seen.
//
// A month is the right window for two reasons. It is what someone actually
// wants to know ("how much have I used this month"), and it matches how billing
// is reckoned, so the tab and the invoice describe the same period.
//
// The rollover is a KEY COMPARISON, not a timer. Stored stats carry the month
// they belong to; the moment the current month differs, they are replaced with
// an empty set. That means it resets correctly on the 1st even if the editor
// was closed over the boundary, was asleep, or is in a different timezone from
// wherever it was last opened — none of which a scheduled reset would survive.

/** Storage this tracker persists through. Injected rather than imported so the
 *  module stays free of vscode and remains unit-testable. */
export interface StatsStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | void;
}

const STORAGE_KEY = 'ava-supernova.usageStats';

export interface UsageStats {
  messages: number;
  tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model_breakdown: Array<{
    model: string;
    provider: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  /** ISO timestamp the current month's counting began. Kept under the old name
   *  so the dashboard's existing SessionStats contract still matches. */
  session_start: string;
  /** The month these belong to, 'YYYY-MM'. Absent on stats written before the
   *  monthly rollover existed — treated as stale and cleared on first read. */
  month?: string;
}

/** Retained so existing imports keep compiling; the shape is unchanged. */
export type SessionStats = UsageStats;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** First moment of the current month, local time — what the counting is since. */
function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

class UsageStatsTracker {
  private stats: UsageStats;
  private store: StatsStore | null = null;

  constructor() {
    this.stats = this.empty();
  }

  /**
   * Give the tracker somewhere to persist, and load whatever is already there.
   *
   * Called once at activation. Until it happens the tracker still works — it
   * just counts in memory, which is what it did before and is better than
   * dropping usage on the floor while waiting for storage.
   */
  attach(store: StatsStore): void {
    this.store = store;
    const saved = store.get<UsageStats>(STORAGE_KEY);
    if (saved && saved.month === currentMonth()) {
      // Fold anything counted before attach into the restored figures, so
      // usage from the first moments of a session is not lost.
      this.stats = this.merge(saved, this.stats);
    } else {
      // Different month, or written before this field existed. Either way the
      // stored numbers describe a period that is over.
      this.stats = this.empty();
    }
    this.persist();
  }

  /** Roll over if the month has turned since the last write. Called before
   *  every mutation, so a long-running window crossing midnight on the 1st
   *  starts counting fresh rather than adding to last month. */
  private rollIfNeeded(): void {
    if (this.stats.month !== currentMonth()) this.stats = this.empty();
  }

  recordUsage(model: string, provider: string, inputTokens: number, outputTokens: number): void {
    this.rollIfNeeded();
    this.stats.total_input_tokens += inputTokens;
    this.stats.total_output_tokens += outputTokens;

    const existing = this.stats.model_breakdown.find(
      m => m.model === model && m.provider === provider
    );
    if (existing) {
      existing.requests++;
      existing.input_tokens += inputTokens;
      existing.output_tokens += outputTokens;
    } else {
      this.stats.model_breakdown.push({
        model,
        provider,
        requests: 1,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
    }
    this.persist();
  }

  recordMessage(): void {
    this.rollIfNeeded();
    this.stats.messages++;
    this.persist();
  }

  recordToolCall(): void {
    this.rollIfNeeded();
    this.stats.tool_calls++;
    this.persist();
  }

  getStats(): UsageStats {
    this.rollIfNeeded();
    return { ...this.stats, model_breakdown: [...this.stats.model_breakdown] };
  }

  /** Combine two sets of stats — used only to fold pre-attach counting into
   *  what was restored from storage. */
  private merge(base: UsageStats, extra: UsageStats): UsageStats {
    const out: UsageStats = {
      ...base,
      messages: base.messages + extra.messages,
      tool_calls: base.tool_calls + extra.tool_calls,
      total_input_tokens: base.total_input_tokens + extra.total_input_tokens,
      total_output_tokens: base.total_output_tokens + extra.total_output_tokens,
      model_breakdown: base.model_breakdown.map(m => ({ ...m })),
    };
    for (const e of extra.model_breakdown) {
      const hit = out.model_breakdown.find(m => m.model === e.model && m.provider === e.provider);
      if (hit) {
        hit.requests += e.requests;
        hit.input_tokens += e.input_tokens;
        hit.output_tokens += e.output_tokens;
      } else {
        out.model_breakdown.push({ ...e });
      }
    }
    return out;
  }

  /** Fire and forget. A failed write must never interrupt a turn — the numbers
   *  are a report, not the work. */
  private persist(): void {
    try {
      void this.store?.update(STORAGE_KEY, this.stats);
    } catch { /* storage unavailable — keep counting in memory */ }
  }

  private empty(): UsageStats {
    return {
      messages: 0,
      tool_calls: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      model_breakdown: [],
      session_start: monthStart(),
      month: currentMonth(),
    };
  }
}

export const sessionStats = new UsageStatsTracker();
