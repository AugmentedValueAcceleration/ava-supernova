import { useState, useEffect } from 'react';
import { t, useLocale } from '../../i18n';

/**
 * The line under the spinner while Ava works.
 *
 * This used to rotate four canned strings every three seconds — "Analyzing
 * your code…", "Considering approaches…", "Crafting a response…" — none of
 * which anything checked. "Analyzing your code" is simply false when she is
 * drafting a document, and this surface never received a real status at all:
 * the host has been forwarding `progress` events here the whole time and the
 * reducer dropped them, so the full-page chat could only ever show decoration.
 *
 * `label` is now a state the code genuinely knows — request in flight, model
 * reasoning, context being compressed. Where nothing more specific is known it
 * says "Working…" rather than inventing a specific.
 *
 * The counter resets whenever the label changes, so it measures THIS step and
 * not the whole turn. That is what makes a stuck step legible, and it answers
 * the question a user actually has during a long silence — is this still
 * going? A stale label degrades honestly instead of freezing on a lie.
 */
export function ThinkingIndicator({ label }: { label?: string } = {}) {
  useLocale();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [label]);

  return (
    <div className="flex items-center gap-2 px-2 py-2 text-xs opacity-50" role="status" aria-label={t('thinking.generic')}>
      <span
        className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
        style={{
          borderColor: 'var(--vscode-textLink-foreground, #3794ff)',
          borderTopColor: 'transparent',
        }}
      />
      <span>{label ?? t('thinking.generic')}</span>
      {/* Only past a couple of seconds: on a fast turn it would flash and
          vanish, which reads as a glitch rather than as information. */}
      {elapsed >= 2 && (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>· {elapsed}s</span>
      )}
    </div>
  );
}
