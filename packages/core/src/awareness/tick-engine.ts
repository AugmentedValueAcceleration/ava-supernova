/**
 * ══════════════════════════════════════════════════════════════════════
 * Ava Tick Engine — Proactive Awareness System
 * ══════════════════════════════════════════════════════════════════════
 *
 * Periodic background check that makes Ava continuously aware of the
 * user's world — tasks, journal, memory, support, token balance — and
 * surfaces findings only when they matter.
 *
 * She checks silently. If there's nothing worth saying, the user never
 * knows. If there is, she speaks up gently.
 *
 * Inspired by concepts that a certain "AI safety" company accidentally
 * published to npm because they forgot to add *.map to .npmignore.
 * Cheers Anthropic — couldn't have done it without your generosity. 🍻
 *
 * Unlike theirs, this one ships openly. No feature flags. No stealth.
 * No "undercover mode". Just transparency, as always.
 *
 * ══════════════════════════════════════════════════════════════════════
 */

export interface TickContext {
  /** Check overdue/upcoming tasks */
  getOverdueTasks?: () => Promise<Array<{ title: string; dueDate?: string; priority: string }>>;
  /** Check journal streak */
  getJournalStreak?: () => Promise<{ days: number; writtenToday: boolean }>;
  /** Check token balance */
  getTokenBalance?: () => { used: number; limit: number } | null;
  /** Check unread support messages */
  getSupportUnread?: () => number;
  /** Check for stale/contradictory memories */
  getMemoryHealth?: () => Promise<{ staleCount: number; contradictions: number }>;
}

export interface TickEvent {
  type: 'task_overdue' | 'task_upcoming' | 'journal_streak' | 'token_warning' | 'support_reply' | 'memory_health';
  message: string;
  severity: 'info' | 'nudge' | 'urgent';
  /** Should this interrupt or wait for next natural pause? */
  blocking: boolean;
}

export interface TickResult {
  events: TickEvent[];
  /** Timestamp of this tick */
  timestamp: number;
}

/** Maximum time a proactive action should block the user (ms) */
const BLOCKING_BUDGET_MS = 15_000;

/** Minimum interval between ticks (ms) — don't spam */
const MIN_TICK_INTERVAL_MS = 120_000; // 2 minutes

/** Don't fire the same event type more than once per interval (ms) */
const DEDUP_INTERVAL_MS = 600_000; // 10 minutes

export class TickEngine {
  private lastTick = 0;
  private lastEventByType: Map<string, number> = new Map();

  /**
   * Run a single tick — check everything, return events worth surfacing.
   * Designed to be called periodically from an interval timer.
   * Fast and non-blocking — total execution should stay under BLOCKING_BUDGET_MS.
   */
  async tick(ctx: TickContext): Promise<TickResult> {
    const now = Date.now();

    // Rate limit — don't tick too frequently
    if (now - this.lastTick < MIN_TICK_INTERVAL_MS) {
      return { events: [], timestamp: now };
    }
    this.lastTick = now;

    const events: TickEvent[] = [];
    const start = Date.now();

    // ── Overdue tasks ──────────────────────────────────────────────
    if (ctx.getOverdueTasks && Date.now() - start < BLOCKING_BUDGET_MS) {
      try {
        const overdue = await ctx.getOverdueTasks();
        if (overdue.length > 0 && !this.isDuplicate('task_overdue', now)) {
          const urgent = overdue.filter(t => t.priority === 'urgent' || t.priority === 'high');
          if (urgent.length > 0) {
            events.push({
              type: 'task_overdue',
              message: `You've got ${urgent.length} high-priority task${urgent.length > 1 ? 's' : ''} overdue — "${urgent[0].title}"${urgent.length > 1 ? ` and ${urgent.length - 1} more` : ''}`,
              severity: 'urgent',
              blocking: false,
            });
          } else if (overdue.length > 0) {
            events.push({
              type: 'task_overdue',
              message: `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue — "${overdue[0].title}"${overdue.length > 1 ? ` and ${overdue.length - 1} more` : ''}`,
              severity: 'nudge',
              blocking: false,
            });
          }
        }
      } catch { /* non-critical */ }
    }

    // ── Journal streak ─────────────────────────────────────────────
    if (ctx.getJournalStreak && Date.now() - start < BLOCKING_BUDGET_MS) {
      try {
        const streak = await ctx.getJournalStreak();
        if (streak.days >= 3 && !streak.writtenToday && !this.isDuplicate('journal_streak', now)) {
          const hour = new Date().getHours();
          if (hour >= 19) { // Only nudge in the evening
            events.push({
              type: 'journal_streak',
              message: `You've got a ${streak.days}-day journal streak going. Quick entry before the day ends?`,
              severity: 'nudge',
              blocking: false,
            });
          }
        }
      } catch { /* non-critical */ }
    }

    // ── Token balance ──────────────────────────────────────────────
    if (ctx.getTokenBalance) {
      const balance = ctx.getTokenBalance();
      if (balance && balance.limit > 0 && balance.limit < 999_999_999) {
        const remaining = balance.limit - balance.used;
        const pct = (remaining / balance.limit) * 100;
        if (pct <= 10 && !this.isDuplicate('token_warning', now)) {
          events.push({
            type: 'token_warning',
            message: `Heads up — you've used ${Math.round(100 - pct)}% of your tokens this month. About ${formatTokens(remaining)} left.`,
            severity: pct <= 5 ? 'urgent' : 'nudge',
            blocking: false,
          });
        }
      }
    }

    // ── Support unread ─────────────────────────────────────────────
    if (ctx.getSupportUnread) {
      const unread = ctx.getSupportUnread();
      if (unread > 0 && !this.isDuplicate('support_reply', now)) {
        events.push({
          type: 'support_reply',
          message: `You've got ${unread} unread support message${unread > 1 ? 's' : ''}. Check the Help section.`,
          severity: 'nudge',
          blocking: false,
        });
      }
    }

    // ── Memory health ──────────────────────────────────────────────
    if (ctx.getMemoryHealth && Date.now() - start < BLOCKING_BUDGET_MS) {
      try {
        const health = await ctx.getMemoryHealth();
        if (health.contradictions > 0 && !this.isDuplicate('memory_health', now)) {
          events.push({
            type: 'memory_health',
            message: `I noticed ${health.contradictions} potential contradiction${health.contradictions > 1 ? 's' : ''} in my memory. Might be worth reviewing.`,
            severity: 'info',
            blocking: false,
          });
        }
      } catch { /* non-critical */ }
    }

    // Mark events as fired for dedup
    for (const event of events) {
      this.lastEventByType.set(event.type, now);
    }

    return { events, timestamp: now };
  }

  /** Check if this event type was already fired recently */
  private isDuplicate(type: string, now: number): boolean {
    const last = this.lastEventByType.get(type);
    return !!last && now - last < DEDUP_INTERVAL_MS;
  }

  /** Reset dedup tracking — useful when user explicitly asks for a check */
  reset(): void {
    this.lastEventByType.clear();
    this.lastTick = 0;
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
