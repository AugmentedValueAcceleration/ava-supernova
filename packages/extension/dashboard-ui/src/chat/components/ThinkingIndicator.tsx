import { useState, useEffect } from 'react';
import { t, useLocale } from '../../i18n';

const MESSAGE_KEYS = ['thinking.0', 'thinking.1', 'thinking.2', 'thinking.3'];

export function ThinkingIndicator() {
  useLocale();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGE_KEYS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-2 py-2 text-xs opacity-50" role="status" aria-label={t('thinking.0')}>
      <span
        className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
        style={{
          borderColor: 'var(--vscode-textLink-foreground, #3794ff)',
          borderTopColor: 'transparent',
        }}
      />
      <span>{t(MESSAGE_KEYS[index])}</span>
    </div>
  );
}
