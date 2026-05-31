import { useState, useEffect } from 'react';
import { t, useLocale } from '../i18n';

const MESSAGE_KEYS = ['thinking.0', 'thinking.1', 'thinking.2', 'thinking.3'];

/**
 * Ava-bubble-shaped thinking indicator. Sits in the same visual lane as
 * an assistant message — avatar + name on the left, a pill containing a
 * three-dot pulse and the rotating "thinking…" line. Replaces the prior
 * tiny opacity-50 spinner that disappeared into the dark theme during
 * the 1-3s prep window before stream_start lands. The user sees Ava
 * picking up the moment they hit send.
 *
 * `label` overrides the rotating generic line with a specific status
 * ("Reading your request…", "DeepSeek V4 Pro is working…") emitted by the
 * coordinator during its silent classify/route window — so the longer
 * orchestration-mode prep shows real progress, not a blank pulse.
 */
export function ThinkingIndicator({ label }: { label?: string } = {}) {
  useLocale();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGE_KEYS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-start gap-3 px-1 py-1" role="status" aria-label={t('thinking.0')}>
      <img
        src="ava-avatar.jpeg"
        alt="Ava"
        className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 object-cover"
        style={{ border: '1px solid rgba(168, 85, 247, 0.35)' }}
      />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[11px] font-semibold" style={{ color: '#c084fc' }}>
          Ava
        </span>
        <div
          className="inline-flex items-center gap-2.5 rounded-2xl px-3.5 py-2 text-[12px]"
          style={{
            background: 'linear-gradient(135deg, #0f0f17, #1a1625)',
            border: '1px solid rgba(168, 85, 247, 0.55)',
            color: '#cdd6f4',
            boxShadow: '0 0 12px rgba(168, 85, 247, 0.12)',
          }}
        >
          <span className="ava-thinking-dots inline-flex items-center gap-1" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span>{label ?? t(MESSAGE_KEYS[index])}</span>
        </div>
      </div>
      <style>{`
        .ava-thinking-dots span {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #a855f7;
          animation: avaThinkingPulse 1.2s ease-in-out infinite;
          display: inline-block;
        }
        .ava-thinking-dots span:nth-child(2) { animation-delay: 0.18s; }
        .ava-thinking-dots span:nth-child(3) { animation-delay: 0.36s; }
        @keyframes avaThinkingPulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
          40%           { opacity: 1;    transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
