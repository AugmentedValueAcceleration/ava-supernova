import { useState, useCallback } from 'react';
import { t, useLocale } from '../../i18n';

const POSITIVE_REASON_KEYS = ['feedback.perfect', 'feedback.helpful', 'feedback.creative', 'feedback.good_explanation'] as const;
const NEGATIVE_REASON_KEYS = ['feedback.wrong', 'feedback.incomplete', 'feedback.too_verbose', 'feedback.didnt_understand', 'feedback.off_topic'] as const;

interface FeedbackButtonsProps {
  messageId: string;
  rating?: 'up' | 'down';
  ratingReason?: string;
  onRate: (messageId: string, rating: 'up' | 'down', reason?: string) => void;
}

export function FeedbackButtons({ messageId, rating, onRate }: FeedbackButtonsProps) {
  useLocale();
  const [showReasons, setShowReasons] = useState<'up' | 'down' | null>(null);
  const [submitted, setSubmitted] = useState(!!rating);

  const submit = useCallback((r: 'up' | 'down', reason?: string) => {
    setSubmitted(true);
    setShowReasons(null);
    onRate(messageId, r, reason);
  }, [messageId, onRate]);

  const handleThumbsUp = useCallback(() => {
    if (submitted) return;
    setShowReasons('up');
  }, [submitted]);

  const handleThumbsDown = useCallback(() => {
    if (submitted) return;
    setShowReasons('down');
  }, [submitted]);

  const handleReasonClick = useCallback((reason: string) => {
    submit(showReasons!, reason);
  }, [showReasons, submit]);

  const handleQuickUp = useCallback(() => {
    // Allow quick submit without reason for thumbs up
    submit('up');
  }, [submit]);

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
      {showReasons && (
        <div className="absolute bottom-full left-0 mb-1 z-10
                        bg-[var(--vscode-input-background)] border border-[var(--vscode-panel-border)]
                        rounded-lg shadow-lg py-1 min-w-[160px]">
          <div className="px-2 py-1 text-[10px] font-medium text-[var(--vscode-foreground)] opacity-40 uppercase tracking-wider">
            {showReasons === 'up' ? t('feedback.what_good') : t('feedback.what_wrong')}
          </div>
          {(showReasons === 'up' ? POSITIVE_REASON_KEYS : NEGATIVE_REASON_KEYS).map((key) => (
            <button
              key={key}
              onClick={() => handleReasonClick(t(key))}
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
    </div>
  );
}
