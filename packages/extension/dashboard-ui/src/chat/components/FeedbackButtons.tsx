import { useState, useCallback } from 'react';
import { t, useLocale } from '../../i18n';

/**
 * Thumbs up or down on one of Ava's replies.
 *
 * MIRROR of webview-ui/src/components/FeedbackButtons.tsx. The two UIs bundle
 * separately and cannot import across that boundary, so this is a copy by
 * necessity -- but it must never be a copy that DRIFTS. It was already one:
 * both sent the translated label as the reason, and fixing only the sidebar
 * would have left the dashboard chat quietly corrupting the same counts.
 * Change one, change both.
 *
 * REASONS ARE CODES. This used to call `onRate(messageId, rating, t(key))` —
 * it sent the translated text it had just rendered. So the same complaint
 * reached the platform as "Wrong", "Incorrect" or "Falsch" depending on who
 * left it, the hub counted them as three separate complaints, and the extension's
 * own self-improvement map (keyed on the English strings) silently stopped
 * matching for every user not running in English. A stable code goes on the
 * wire; the words stay here.
 *
 * A THUMBS-DOWN CAN SAY WHY. Five fixed chips cannot express "it invented a
 * function that does not exist", which is the feedback actually worth having.
 * After picking a reason the popover offers a box — optional, skippable, and
 * asked for only on the negative path. Asking someone who just said "perfect"
 * to elaborate is how you teach people to stop rating things.
 *
 * The note is sent as a second call about the SAME feedback, and the server
 * upserts on (message, rater) so it lands on the existing row rather than
 * becoming a second opinion from the same person.
 */

/** [code, i18n key] — the code goes to the server, the key to the screen. */
const POSITIVE_REASONS: Array<[string, string]> = [
  ['perfect', 'feedback.perfect'],
  ['helpful', 'feedback.helpful'],
  ['creative', 'feedback.creative'],
  ['good-explanation', 'feedback.good_explanation'],
];

const NEGATIVE_REASONS: Array<[string, string]> = [
  ['wrong', 'feedback.wrong'],
  ['incomplete', 'feedback.incomplete'],
  ['too-verbose', 'feedback.too_verbose'],
  ['didnt-understand', 'feedback.didnt_understand'],
  ['off-topic', 'feedback.off_topic'],
];

const NOTE_MAX = 2000;

interface FeedbackButtonsProps {
  messageId: string;
  rating?: 'up' | 'down';
  ratingReason?: string;
  onRate: (messageId: string, rating: 'up' | 'down', reason?: string, note?: string) => void;
}

export function FeedbackButtons({ messageId, rating, onRate }: FeedbackButtonsProps) {
  useLocale();
  const [showReasons, setShowReasons] = useState<'up' | 'down' | null>(null);
  const [submitted, setSubmitted] = useState(!!rating);
  /** Set once a thumbs-down reason is in, which switches the popover to the box. */
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const finish = useCallback((r: 'up' | 'down', reason?: string, text?: string) => {
    setSubmitted(true);
    setShowReasons(null);
    setDetailFor(null);
    onRate(messageId, r, reason, text);
  }, [messageId, onRate]);

  const handleThumbsUp = useCallback(() => {
    if (submitted) return;
    setShowReasons('up');
  }, [submitted]);

  const handleThumbsDown = useCallback(() => {
    if (submitted) return;
    setShowReasons('down');
  }, [submitted]);

  const handleReasonClick = useCallback((code: string) => {
    if (showReasons === 'down') {
      // Recorded NOW, not held until the box is dealt with. Someone who picks a
      // reason and then closes the panel has still told us something, and it
      // would be lost if the note step owned the submit.
      onRate(messageId, 'down', code);
      setDetailFor(code);
      return;
    }
    finish('up', code);
  }, [showReasons, messageId, onRate, finish]);

  const handleQuickUp = useCallback(() => finish('up'), [finish]);

  if (submitted) {
    return (
      <div className="flex items-center gap-1 mt-1">
        <span className="text-[10px] text-[var(--vscode-foreground)] opacity-40">
          {t('feedback.thanks')}
        </span>
        <svg className="w-3 h-3 text-green-400/60" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="relative mt-1">
      {/* Thumbs up / down buttons — visible on hover of parent group */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleThumbsUp}
          onDoubleClick={handleQuickUp}
          title={t('feedback.good')}
          className="flex items-center justify-center w-5 h-5 rounded
                     border-none cursor-pointer transition-all
                     bg-transparent hover:bg-[var(--vscode-button-secondaryBackground)]
                     text-[var(--vscode-foreground)] opacity-30 hover:opacity-70"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
          </svg>
        </button>
        <button
          onClick={handleThumbsDown}
          title={t('feedback.bad')}
          className="flex items-center justify-center w-5 h-5 rounded
                     border-none cursor-pointer transition-all
                     bg-transparent hover:bg-[var(--vscode-button-secondaryBackground)]
                     text-[var(--vscode-foreground)] opacity-30 hover:opacity-70"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
          </svg>
        </button>
      </div>

      {/* Reason selector popover */}
      {showReasons && !detailFor && (
        <div className="absolute bottom-full left-0 mb-1 z-10
                        bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)]
                        rounded-lg shadow-lg py-1 min-w-[160px]">
          <div className="px-2 py-1 text-[10px] font-medium text-[var(--vscode-foreground)] opacity-40 uppercase tracking-wider">
            {showReasons === 'up' ? t('feedback.what_good') : t('feedback.what_wrong')}
          </div>
          {(showReasons === 'up' ? POSITIVE_REASONS : NEGATIVE_REASONS).map(([code, key]) => (
            <button
              key={code}
              onClick={() => handleReasonClick(code)}
              className="block w-full text-left px-2.5 py-1.5 text-[11px]
                         border-none cursor-pointer transition-colors
                         bg-transparent hover:bg-[var(--vscode-list-hoverBackground)]
                         text-[var(--vscode-foreground)] opacity-80 hover:opacity-100"
            >
              {t(key)}
            </button>
          ))}
          {showReasons === 'up' && (
            <button
              onClick={handleQuickUp}
              className="block w-full text-left px-2.5 py-1.5 text-[11px] italic
                         border-none cursor-pointer transition-colors
                         bg-transparent hover:bg-[var(--vscode-list-hoverBackground)]
                         text-[var(--vscode-foreground)] opacity-50 hover:opacity-80"
            >
              {t('feedback.skip_reason')}
            </button>
          )}
          <button
            onClick={() => setShowReasons(null)}
            className="block w-full text-left px-2.5 py-1 text-[10px]
                       border-none cursor-pointer transition-colors
                       bg-transparent hover:bg-[var(--vscode-list-hoverBackground)]
                       text-[var(--vscode-foreground)] opacity-30 hover:opacity-60
                       border-t border-t-[var(--vscode-panel-border)] mt-0.5 pt-1"
          >
            {t('feedback.cancel')}
          </button>
        </div>
      )}

      {/* What actually happened — negative path only, and always skippable. */}
      {detailFor && (
        <div className="absolute bottom-full left-0 mb-1 z-10 w-[260px]
                        bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)]
                        rounded-lg shadow-lg p-2">
          <div className="text-[10px] font-medium text-[var(--vscode-foreground)] opacity-40 uppercase tracking-wider mb-1">
            {t('feedback.detail_heading')}
          </div>
          <textarea
            autoFocus
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish('down', detailFor, note.trim() || undefined);
              if (e.key === 'Escape') finish('down', detailFor);
            }}
            rows={3}
            placeholder={t('feedback.detail_placeholder')}
            className="w-full resize-none rounded px-1.5 py-1 text-[11px]
                       bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]
                       border border-[var(--vscode-panel-border)] outline-none
                       focus:border-[var(--vscode-focusBorder)]"
          />
          <div className="flex items-center justify-between mt-1.5">
            <button
              onClick={() => finish('down', detailFor)}
              className="text-[10px] border-none cursor-pointer bg-transparent
                         text-[var(--vscode-foreground)] opacity-40 hover:opacity-70"
            >
              {t('feedback.detail_skip')}
            </button>
            <button
              onClick={() => finish('down', detailFor, note.trim() || undefined)}
              disabled={!note.trim()}
              className="text-[11px] px-2 py-0.5 rounded border-none cursor-pointer
                         bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]
                         disabled:opacity-30 disabled:cursor-default"
            >
              {t('feedback.detail_send')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
