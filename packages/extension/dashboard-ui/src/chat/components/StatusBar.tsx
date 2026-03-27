import { t, useLocale } from '../../i18n';

interface StatusBarProps {
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
  };
}

export function StatusBar({ usage }: StatusBarProps) {
  useLocale();
  return (
    <div className="px-3 py-1 text-[10px] opacity-40 border-t border-[var(--vscode-panel-border)]">
      {usage.prompt_tokens.toLocaleString()} {t('status.in')} / {usage.completion_tokens.toLocaleString()} {t('status.out')}
      {usage.cost !== undefined && usage.cost > 0 && (
        <span> / ${usage.cost.toFixed(6)}</span>
      )}
    </div>
  );
}
