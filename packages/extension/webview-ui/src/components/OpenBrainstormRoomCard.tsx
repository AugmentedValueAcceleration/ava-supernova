import type { ToolCallDisplay } from '../types/messages';
import { t, useLocale } from '../i18n';
import { useVSCodeApi } from '../hooks/useVSCodeApi';

/**
 * The sidebar's hand-off to the Brainstorm room (plan 2026-11-17-brainstorm).
 * Brainstorming lives only in the room, which is on the dashboard, so the button
 * opens the dashboard there — on a NEW brainstorm that starts from the primer.
 * The dashboard's own card (chat/components/OpenBrainstormRoomCard) does the same
 * from inside the dashboard.
 */
export function OpenBrainstormRoomCard({ toolCall }: { toolCall: ToolCallDisplay }) {
  useLocale();
  const { postMessage } = useVSCodeApi();
  let topic: string | undefined;
  let primer: string | undefined;
  try { const a = JSON.parse(toolCall.arguments); topic = a?.topic; primer = a?.primer; } catch { /* no args */ }
  const title = topic ? t('brainstorm.handoff.title.topic', { topic }) : t('brainstorm.handoff.title.generic');
  const seed = primer?.trim() || (topic ? t('brainstorm.handoff.seed_topic', { topic }) : t('brainstorm.handoff.seed'));

  return (
    <div className="rounded-xl p-3" style={{ border: '1px solid rgba(168, 85, 247, 0.3)', background: 'rgba(168, 85, 247, 0.06)' }}>
      <div className="mb-1 flex items-center gap-2">
        <span aria-hidden style={{ color: '#a855f7' }}>✦</span>
        <span className="text-[12px] font-semibold" style={{ color: '#cdd6f4' }}>{title}</span>
      </div>
      <p className="mb-2.5 text-[11px] leading-relaxed" style={{ color: '#a6adc8' }}>{t('brainstorm.handoff.body')}</p>
      <button
        type="button"
        onClick={() => postMessage({ type: 'open_dashboard_page', page: 'brainstorm', primer: seed })}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-white"
        style={{ background: '#a855f7', border: 'none', cursor: 'pointer' }}
      >
        {t('brainstorm.handoff.button')} <span aria-hidden>→</span>
      </button>
    </div>
  );
}
