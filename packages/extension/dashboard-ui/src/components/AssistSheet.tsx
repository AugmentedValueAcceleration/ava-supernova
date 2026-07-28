// ─── Ask Ava — help with THIS day ───────────────────────────────────────────
//
// The hybrid the whole builder is for. Not "AI writes it all", not "you are on
// your own": you drive, and Ava is there for exactly the parts you want.
//
// Three rules shape this screen.
//
//   1. It PROPOSES. Nothing is saved until you accept. The current day is shown
//      beside the suggestion so you can see precisely what changed before it
//      touches your work.
//   2. It says what it did, in a sentence. A change you cannot see the
//      reasoning for is a change you cannot trust.
//   3. It is honest about the wait. This takes the better part of a minute, so
//      the screen says so rather than showing a spinner and hoping.

import { useState } from 'react';
import { t, useLocale } from '../i18n';
import { Sheet } from './ShoppingListSheet';
import type { HealthPlan, HealthPlanDay, HealthPlanType } from '../types/messages';

/** Openers for the things people actually want, so nobody faces a blank box.
 *  Each is a real sentence they can then edit, not a mode. */
const PROMPTS: Array<{ key: string; forType: HealthPlanType[] }> = [
  { key: 'fill',     forType: ['fitness', 'meal', 'combined'] },
  { key: 'finisher', forType: ['fitness', 'combined'] },
  { key: 'warmup',   forType: ['fitness', 'combined'] },
  { key: 'easier',   forType: ['fitness', 'combined'] },
  { key: 'protein',  forType: ['meal', 'combined'] },
  { key: 'quicker',  forType: ['meal', 'combined'] },
];

/** The calendar date a plan day falls on, or null for a plan that has not
 *  started. Day 1 IS the start date; day_index is 1-based. Exact, not assumed —
 *  it is what lets the server use that weekday's real cooking ceiling. */
export function dayDate(plan: HealthPlan, day: HealthPlanDay): string | null {
  if (!plan.start_date) return null;
  const start = Date.parse(`${plan.start_date}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  return new Date(start + (day.day_index - 1) * 86_400_000).toISOString().slice(0, 10);
}

export interface DayProposal {
  day: HealthPlanDay;
  note: string;
  credits: number;
  unverifiable: string[];
}

export function AssistSheet({ plan, day, busy, error, proposal, onAsk, onApply, onDiscard, onClose }: {
  plan: HealthPlan;
  day: HealthPlanDay;
  busy: boolean;
  error: string | null;
  proposal: DayProposal | null;
  onAsk: (instruction: string) => void;
  onApply: (day: HealthPlanDay) => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  useLocale();
  const [instruction, setInstruction] = useState('');
  const prompts = PROMPTS.filter(p => p.forType.includes(plan.type));

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onAsk(trimmed);
  };

  return (
    <Sheet
      title={t('health.assist.title')}
      subtitle={day.title ?? `${t('health.plans.day_n', { n: day.day_index })}`}
      onClose={onClose}
    >
      {proposal ? (
        <div className="space-y-4">
          {/* What she did, in her own sentence, above the diff. */}
          {proposal.note && (
            <p className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {proposal.note}
            </p>
          )}

          {/* Side by side, so nothing changes that you did not see change. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DayColumn label={t('health.assist.current')} day={day} />
            <DayColumn label={t('health.assist.proposed')} day={proposal.day} highlight />
          </div>

          {/* Absence of evidence, said as such. These were NOT cleared — the
              library simply holds nothing either way, and saying nothing would
              let a day look checked when it was only unchecked. */}
          {proposal.unverifiable.length > 0 && (
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2">
              <p className="text-[11px] leading-relaxed text-amber-200/90">{t('health.assist.unverifiable')}</p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{proposal.unverifiable.join(', ')}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onApply(proposal.day); onClose(); }}
              className="flex-1 cursor-pointer rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-[12px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
            >
              {t('health.assist.accept')}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="cursor-pointer rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[12px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              {t('health.assist.discard')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {prompts.map(p => (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                onClick={() => { const s = t(`health.assist.prompt.${p.key}`); setInstruction(s); ask(s); }}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-[11px] text-[var(--text-muted)] transition enabled:cursor-pointer enabled:hover:border-[var(--accent)]/40 enabled:hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                {t(`health.assist.prompt.${p.key}`)}
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder={t('health.assist.placeholder')}
            disabled={busy}
            className="w-full resize-y rounded-lg border border-[var(--border-input)] bg-[#1a1028] px-3 py-2 font-[inherit] text-[12px] text-white outline-none transition focus:border-[var(--accent)] disabled:opacity-50"
          />

          {error && (
            <p className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-[11px] leading-relaxed text-red-300">
              {t('health.assist.failed')} {error}
            </p>
          )}

          {/* Said plainly rather than implied by a spinner. */}
          {busy && <p className="text-[11px] text-[var(--text-muted)]">{t('health.assist.working')}</p>}

          <button
            type="button"
            onClick={() => ask(instruction)}
            disabled={busy || !instruction.trim()}
            className="w-full rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-[12px] font-medium text-[var(--accent)] transition enabled:cursor-pointer enabled:hover:bg-[var(--accent)]/20 disabled:opacity-40"
          >
            {t('health.assist.ask')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function DayColumn({ label, day, highlight }: { label: string; day: HealthPlanDay; highlight?: boolean }) {
  const empty = day.training.length === 0 && day.meals.length === 0;
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5' : 'border-[var(--border)]'}`}>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      {empty ? (
        <p className="text-[11px] italic text-[var(--text-muted)]">{t('health.assist.empty_day')}</p>
      ) : (
        <ul className="space-y-1">
          {day.training.map(ex => (
            <li key={ex.id} className="text-[11px] leading-snug text-[var(--text-secondary)]">
              {ex.name}
              {ex.sets != null && <span className="text-[var(--text-muted)]"> {ex.sets}×{ex.reps ?? '?'}</span>}
            </li>
          ))}
          {day.meals.map(m => (
            <li key={m.id} className="text-[11px] leading-snug text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">{m.slot} — </span>{m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
