/**
 * ContextBar — context-window usage indicator that sits just above the
 * composer. Previously lived at the top of the chat as a full-width button
 * with a bottom border; moved here so it's visible exactly where the next
 * turn gets composed, no border or heavy container needed.
 *
 * Design intent:
 *   - Slim. One thin track + one small caption line.
 *   - Transparent background; the composer's own container owns the frame.
 *   - Caption hidden under 25% usage so empty chats stay clean; tooltip
 *     still exposes the numbers on hover.
 *   - Colour ramps as the window fills: accent → amber at 80% → red at 90%.
 *   - Click to compress when it's worth it (≥25%, not streaming).
 */

import { t, useLocale } from '../i18n';

interface ContextBarProps {
  contextUsage: { used: number; limit: number; percent: number } | null;
  isCompressing?: boolean;
  isStreaming?: boolean;
  onCompress?: () => void;
}

export function ContextBar({ contextUsage, isCompressing, isStreaming, onCompress }: ContextBarProps) {
  useLocale();

  const hasUsage = !!contextUsage && contextUsage.limit > 0;
  const preciseFraction = hasUsage ? (contextUsage!.used / contextUsage!.limit) : 0;
  const pct = hasUsage ? Math.min(100, Math.max(0, contextUsage!.percent)) : 0;
  const visualPct = Math.max(pct, preciseFraction * 100);
  const isWarning = pct >= 80;
  const isCritical = pct >= 90;
  const compressable = !isCompressing && !isStreaming && pct >= 25 && !!onCompress;

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
      ? `Context: ${usedDisplay} / ${limitDisplay} (${pct}%)${compressable ? ' — click to compress' : ''}`
      : 'Context — awaiting first turn';

  // Whole strip is ~14px tall: 2px track + ~10px caption. Caption appears
  // from 25% onward; below that it's just a whisper of a line so empty
  // chats stay clean.
  const Strip = (
    <div className="w-full select-none" style={{ lineHeight: 1 }}>
      {/* Progress track */}
      <div
        className="relative w-full"
        style={{ height: '2px', backgroundColor: 'rgba(168, 85, 247, 0.10)' }}
      >
        <div
          className="absolute top-0 left-0 h-full transition-[width,background-color] duration-500 ease-out"
          style={{
            width: `${Math.max(visualPct, 0.5)}%`,
            backgroundColor: fillColor,
            opacity: (isCompressing || isStreaming) ? 0.5 : 1,
            minWidth: hasUsage && contextUsage!.used > 0 ? '2px' : '0px',
          }}
        />
      </div>

      {/* Caption — only surfaces once the number is worth glancing at. */}
      <div
        className={`flex items-center justify-end px-3 pt-0.5 h-3 transition-opacity ${
          pct >= 25 ? 'opacity-90' : 'opacity-0'
        }`}
      >
        <span
          className="text-[9px] tabular-nums tracking-wide"
          style={{ color: fillColor }}
        >
          {isCompressing
            ? t('input.compressing')
            : `${usedDisplay} / ${limitDisplay} · ${pct}%${compressable ? ' · click to compress' : ''}`}
        </span>
      </div>
    </div>
  );

  // When the user can compress, wrap in a button so the whole strip is
  // clickable; otherwise render a static div so hover doesn't pretend
  // there's an action.
  if (compressable) {
    return (
      <button
        type="button"
        aria-label={tooltip}
        title={tooltip}
        onClick={onCompress}
        className="w-full block bg-transparent border-none p-0 cursor-pointer hover:opacity-90 transition-opacity group"
        style={{ WebkitAppearance: 'none' }}
      >
        {Strip}
      </button>
    );
  }

  return (
    <div aria-label={tooltip} title={tooltip} className="w-full">
      {Strip}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
