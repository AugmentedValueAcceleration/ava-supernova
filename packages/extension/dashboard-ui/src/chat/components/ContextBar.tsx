/**
 * ContextBar — horizontal context-usage indicator rendered above the chat.
 *
 * Replaces the circular usage chip previously tucked into the input area.
 * Sits at the top of the chat panel as a thin progress bar, stays out of
 * the way when usage is low, escalates colour as the window fills, and
 * clicks to trigger manual compression.
 */

import { t, useLocale } from '../../i18n';

interface ContextBarProps {
  contextUsage: { used: number; limit: number; percent: number } | null;
  isCompressing?: boolean;
  isStreaming?: boolean;
  onCompress?: () => void;
}

export function ContextBar({ contextUsage, isCompressing, isStreaming, onCompress }: ContextBarProps) {
  useLocale();

  // Always render the track so users see WHERE the bar lives, even on
  // the first turn before any context_usage event has arrived. If
  // contextUsage is null we show an empty track with muted styling; as
  // soon as the first event arrives the fill animates in.
  const hasUsage = !!contextUsage && contextUsage.limit > 0;
  const preciseFraction = hasUsage ? (contextUsage!.used / contextUsage!.limit) : 0;
  const pct = hasUsage ? Math.min(100, Math.max(0, contextUsage!.percent)) : 0;
  const visualPct = Math.max(pct, preciseFraction * 100);
  const isWarning = pct >= 80;
  const isCritical = pct >= 90;
  const disabled = isCompressing || isStreaming;

  const fillColor = isCritical
    ? '#ef4444'
    : isWarning
      ? '#eab308'
      : 'var(--color-accent, #a855f7)';

  const usedDisplay = hasUsage ? formatTokens(contextUsage!.used) : '—';
  const limitDisplay = hasUsage ? formatTokens(contextUsage!.limit) : '—';

  const tooltip = isCompressing
    ? t('input.compressing')
    : hasUsage
      ? `Context: ${usedDisplay} / ${limitDisplay} (${pct}%) — click to compress`
      : 'Context bar — awaiting first turn';

  return (
    <button
      type="button"
      aria-label={tooltip}
      title={tooltip}
      onClick={onCompress}
      disabled={disabled || !onCompress}
      className="w-full block border-b border-[var(--vscode-panel-border)]
                 bg-transparent px-0 py-0 cursor-pointer disabled:cursor-default
                 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors group"
      style={{ WebkitAppearance: 'none' }}
    >
      <div
        className="relative w-full"
        style={{
          height: '4px',
          backgroundColor: 'rgba(168, 85, 247, 0.10)',
        }}
      >
        <div
          className="absolute top-0 left-0 h-full transition-[width,background-color] duration-500 ease-out"
          style={{
            width: `${Math.max(visualPct, 0.5)}%`,
            backgroundColor: fillColor,
            opacity: disabled ? 0.5 : 1,
            minWidth: hasUsage && contextUsage!.used > 0 ? '3px' : '0px',
          }}
        />
      </div>

      <div
        className={`flex items-center justify-between px-3 py-0.5 transition-opacity ${
          pct >= 25 ? 'opacity-100' : 'opacity-0 group-hover:opacity-80'
        }`}
      >
        <span className="text-[10px] opacity-50 tracking-wide">Context</span>
        <span
          className="text-[10px] font-medium tabular-nums tracking-wide"
          style={{ color: fillColor, opacity: disabled ? 0.5 : 0.85 }}
        >
          {isCompressing
            ? t('input.compressing')
            : `${usedDisplay} / ${limitDisplay} · ${pct}%${pct >= 25 ? ' · click to compress' : ''}`}
        </span>
      </div>
    </button>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
