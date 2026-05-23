import { useState, useCallback } from 'react';
import { t, useLocale } from '../i18n';

interface CopyButtonProps {
  getText: () => string;
  className?: string;
}

export function CopyButton({ getText, className = '' }: CopyButtonProps) {
  useLocale();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getText]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? t('copy.copied') : t('copy.copy')}
      aria-label={copied ? t('copy.copied_aria') : t('copy.copy_aria')}
      className={`flex items-center justify-center rounded
                  border-none cursor-pointer transition-opacity
                  bg-[var(--vscode-button-secondaryBackground)]
                  text-[var(--vscode-button-secondaryForeground)]
                  ${className}`}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/>
        </svg>
      )}
    </button>
  );
}
