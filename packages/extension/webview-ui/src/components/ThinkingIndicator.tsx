import { useState, useEffect } from 'react';
import { t, useLocale } from '../i18n';

/**
 * Ava-bubble-shaped thinking indicator. Sits in the same visual lane as
 * an assistant message — avatar + name on the left, a pill containing a
 * three-dot pulse and a line saying what is actually happening.
 *
 * It used to rotate four canned strings every three seconds: "Analyzing your
 * code…", "Considering approaches…". Nobody checked whether any of them were
 * true, and "analyzing your code" is simply false when Ava is drafting a
 * document. The line now only ever says something the code knows: `label`
 * comes from a real state (request in flight, model reasoning, context being
 * compressed), and where nothing more specific is known it says "Working…"
 * rather than inventing a specific.
 *
 * The elapsed counter is the other half. During a long silent window the
 * question a user actually has is "is this stuck?", and a number answers it
 * where an adjective never could. It also means a stale label degrades
 * honestly — "Compressing context… · 40s" is still true and visibly wrong.
 */
export function ThinkingIndicator({ label }: { label?: string } = {}) {
  useLocale();
  const [elapsed, setElapsed] = useState(0);

  // Restarts whenever the label changes, so the number is the age of THIS
  // step rather than of the whole turn — which is what makes a stuck step
  // legible instead of hidden inside a total.
  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [label]);

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
          <span>{label ?? t('thinking.generic')}</span>
          {/* Only past a couple of seconds: on a fast turn the counter would
              flash 1s and vanish, which reads as a glitch. */}
          {elapsed >= 2 && (
            <span style={{ opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>
              · {elapsed}s
            </span>
          )}
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
