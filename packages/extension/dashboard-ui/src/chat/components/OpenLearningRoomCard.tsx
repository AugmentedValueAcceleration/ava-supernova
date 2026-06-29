import type { ToolCallDisplay } from '../../types/messages';
import { t, useLocale } from '../../i18n';
import { Icon } from '../../components/Icon';

/**
 * Handoff card for the main chat. When Ava calls open_learning_room (a learn-a-
 * topic / course request belongs in the focused Learning room, not the main
 * chat), this renders a button that jumps to the Learning room → the Ava tab and
 * seeds it with the topic. Navigation is done at the App level via the
 * 'ava-open-learning-room' event so the card doesn't need props threaded through
 * the whole chat tree. Mirror of OpenHealthRoomCard.
 */
export function OpenLearningRoomCard({ toolCall }: { toolCall: ToolCallDisplay }) {
  useLocale();
  let topic: string | undefined;
  let primer: string | undefined;
  try { const a = JSON.parse(toolCall.arguments); topic = a?.topic; primer = a?.primer; } catch { /* no args */ }

  const title = topic
    ? t('learning.handoff.title.topic', { topic })
    : t('learning.handoff.title.generic');

  const open = () => window.dispatchEvent(new CustomEvent('ava-open-learning-room', { detail: { topic, primer } }));

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[var(--accent)]" aria-hidden><Icon.course size={15} /></span>
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-muted)]">{t('learning.handoff.body')}</p>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12px] font-medium text-white transition hover:opacity-90"
      >
        {t('learning.handoff.button')}
        <Icon.next size={14} />
      </button>
    </div>
  );
}
