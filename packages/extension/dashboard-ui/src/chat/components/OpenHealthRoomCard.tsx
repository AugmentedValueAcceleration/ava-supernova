import type { ToolCallDisplay } from '../../types/messages';
import { t, useLocale } from '../../i18n';
import { Icon } from '../../components/Icon';

/**
 * Handoff card for the main chat. When Ava calls open_health_room (a plan
 * request belongs in the focused Health room, not the main chat), this renders
 * a button that jumps to Health → the Ava room and seeds it with the plan type.
 * Navigation is done at the App level via the 'ava-open-health-room' event so
 * the card doesn't need props threaded through the whole chat tree.
 */
export function OpenHealthRoomCard({ toolCall }: { toolCall: ToolCallDisplay }) {
  useLocale();
  let planType: string | undefined;
  let primer: string | undefined;
  try { const a = JSON.parse(toolCall.arguments); planType = a?.plan_type; primer = a?.primer; } catch { /* no args */ }

  const titleKey =
    planType === 'fitness' ? 'health.handoff.title.fitness'
    : planType === 'meal' ? 'health.handoff.title.meal'
    : planType === 'combined' ? 'health.handoff.title.combined'
    : 'health.handoff.title.generic';

  const open = () => window.dispatchEvent(new CustomEvent('ava-open-health-room', { detail: { planType, primer } }));

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[var(--accent)]" aria-hidden><Icon.fitness size={15} /></span>
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{t(titleKey)}</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-muted)]">{t('health.handoff.body')}</p>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12px] font-medium text-white transition hover:opacity-90"
      >
        {t('health.handoff.button')}
        <Icon.next size={14} />
      </button>
    </div>
  );
}
