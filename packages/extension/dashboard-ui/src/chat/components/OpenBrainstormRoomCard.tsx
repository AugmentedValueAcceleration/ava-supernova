import type { ToolCallDisplay } from '../../types/messages';
import { t, useLocale } from '../../i18n';
import { Icon } from '../../components/Icon';

/**
 * Handoff card for the main chat (plan 2026-11-17-brainstorm, Phase 3). When Ava
 * calls open_brainstorm_room — the brainstorm has grown past a quick thought —
 * this renders a button that opens the Brainstorm room on a NEW brainstorm and
 * sends the primer as its first message. Navigation happens at the App level
 * via the 'ava-open-brainstorm-room' event. Mirror of OpenLearningRoomCard.
 */
export function OpenBrainstormRoomCard({ toolCall }: { toolCall: ToolCallDisplay }) {
  useLocale();
  let topic: string | undefined;
  let primer: string | undefined;
  try { const a = JSON.parse(toolCall.arguments); topic = a?.topic; primer = a?.primer; } catch { /* no args */ }

  const title = topic ? t('brainstorm.handoff.title.topic', { topic }) : t('brainstorm.handoff.title.generic');
  const open = () => window.dispatchEvent(new CustomEvent('ava-open-brainstorm-room', { detail: { topic, primer } }));

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[var(--accent)]" aria-hidden><Icon.idea size={15} /></span>
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-muted)]">{t('brainstorm.handoff.body')}</p>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12px] font-medium text-white transition hover:opacity-90"
      >
        {t('brainstorm.handoff.button')}
        <Icon.next size={14} />
      </button>
    </div>
  );
}
