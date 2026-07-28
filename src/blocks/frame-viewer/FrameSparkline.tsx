import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';

import {
  type SparklineSeries,
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
  sparklinePathD,
} from './frame-sparkline';

export function FrameSparkline({
  series,
  className,
}: {
  series: SparklineSeries | undefined;
  className?: string;
}) {
  if (!series || series.points.length < 2) {
    return (
      <span
        className={cn('text-muted-foreground/35 font-mono text-[10px]', className)}
        aria-hidden
      >
        —
      </span>
    );
  }

  const path = sparklinePathD(series.points, SPARKLINE_WIDTH, SPARKLINE_HEIGHT);
  if (!path) {
    return (
      <span
        className={cn('text-muted-foreground/35 font-mono text-[10px]', className)}
        aria-hidden
      >
        —
      </span>
    );
  }

  const title = m['analyses.frame_sparkline_tip']({
    count: series.count.toLocaleString(),
    min: String(series.min),
    max: String(series.max),
  });

  return (
    <svg
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      className={cn('text-sky-600/85 dark:text-sky-400/85 shrink-0', className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
