import type { CSSProperties } from 'react';

/**
 * Skeleton — shimmer placeholder blocks for page-load states.
 *
 * Pages render a composed skeleton that mirrors their real layout
 * while their data is in flight, so content settles in place instead
 * of flashing empty or jumping in after a spinner. The shimmer + base
 * styles live in index.css under `.ava-skeleton`.
 *
 * Usage — compose primitives to echo the page's actual shape:
 *   <Skeleton width={180} height={24} />        // a heading
 *   <SkeletonText lines={3} />                  // a paragraph
 *   <Skeleton height={120} radius={12} />       // a card
 */

interface SkeletonProps {
  /** CSS width — number (px) or any CSS length. Defaults to full width. */
  width?: number | string;
  /** CSS height in px (or any CSS length). */
  height?: number | string;
  /** Corner radius in px. */
  radius?: number;
  /** Circle shape — overrides radius. Handy for avatars / status dots. */
  circle?: boolean;
  style?: CSSProperties;
  className?: string;
}

/** A single shimmer block. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 6,
  circle = false,
  style,
  className,
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`ava-skeleton${className ? ` ${className}` : ''}`}
      style={{
        width,
        height,
        borderRadius: circle ? '50%' : radius,
        ...style,
      }}
    />
  );
}

/** A stack of skeleton text lines — the last line is shortened so it
 *  reads like a real paragraph rather than a solid block. */
export function SkeletonText({
  lines = 3,
  gap = 8,
  lastLineWidth = '60%',
}: {
  lines?: number;
  gap?: number;
  lastLineWidth?: number | string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

/** A card-shaped skeleton — a titled block with a few text lines.
 *  The default building block for grid / list page skeletons. */
export function SkeletonCard({
  height = 132,
  radius = 12,
  style,
}: {
  height?: number;
  radius?: number;
  style?: CSSProperties;
}) {
  return <Skeleton height={height} radius={radius} style={style} />;
}
