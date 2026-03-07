import { useCallback } from 'react';
import { t } from '../i18n';

interface ContextBarProps {
  contextUsage: { used: number; limit: number; percent: number } | null;
  isCompressing: boolean;
  onCompress: () => void;
  disabled?: boolean;
}

export function ContextBar({ contextUsage, isCompressing, onCompress, disabled }: ContextBarProps) {
  if (!contextUsage || contextUsage.percent <= 0) return null;

  const { percent } = contextUsage;

  const colorClass =
    percent >= 80
      ? 'bg-[var(--vscode-errorForeground,#e53935)]'
      : percent >= 60
        ? 'bg-[var(--vscode-editorWarning-foreground,#cca700)]'
        : 'bg-[var(--color-accent,var(--vscode-button-background))]';

  const textColorClass =
    percent >= 80
      ? 'text-[var(--vscode-errorForeground,#e53935)]'
      : percent >= 60
        ? 'text-[var(--vscode-editorWarning-foreground,#cca700)]'
        : 'opacity-50';

  const handleClick = useCallback(() => {
    if (!isCompressing && !disabled) {
      onCompress();
    }
  }, [isCompressing, disabled, onCompress]);

  return (
    <button
      onClick={handleClick}
      disabled={isCompressing || disabled}
      title={isCompressing ? t('input.compressing') : t('input.compress_click')}
      className="w-full flex items-center gap-2 px-4 py-1.5
                 bg-transparent border-none cursor-pointer
                 hover:bg-[var(--vscode-list-hoverBackground)]
                 disabled:cursor-default disabled:hover:bg-transparent
                 transition-colors group"
    >
      {/* Bar */}
      <div className="flex-1 h-1.5 rounded-full bg-[var(--vscode-input-background)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      {/* Label */}
      <span className={`text-[10px] tabular-nums font-medium shrink-0 ${textColorClass}`}>
        {isCompressing ? t('input.compressing') : `Context ${percent}%`}
        {!isCompressing && percent >= 80 && ' \u26A0'}
      </span>
    </button>
  );
}
