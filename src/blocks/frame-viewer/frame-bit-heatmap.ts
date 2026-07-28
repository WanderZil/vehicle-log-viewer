import type { RawFrameRow } from '@/modules/analyses/types';

export type BitHeatmapCell = {
  byteIndex: number;
  /** 0–7, LSB-oriented bit index within the byte */
  bitInByte: number;
  flipCount: number;
  /** Normalized 0–1 relative to the busiest bit in this message. */
  intensity: number;
  /** Value in the reference (current) frame, if available. */
  currentValue: 0 | 1 | null;
};

export type BitHeatmapData = {
  byteCount: number;
  /** [byte][bit7..bit0] columns, matching Vector/CANdb++ layout */
  grid: BitHeatmapCell[][];
  frameCount: number;
  comparedPairs: number;
  maxFlipCount: number;
};

function isHeatmapEligible(row: RawFrameRow): boolean {
  return !row.isError && !row.isRemote && row.dataBytes.length > 0;
}

function readBit(dataBytes: number[], byteIndex: number, bitInByte: number): 0 | 1 {
  if (byteIndex >= dataBytes.length) return 0;
  return ((dataBytes[byteIndex]! >> bitInByte) & 1) as 0 | 1;
}

/**
 * Count per-bit toggles between consecutive frames of the same message.
 * Frames should already be filtered to one channel + arbitration ID.
 */
export function buildMessageBitHeatmap(
  frames: RawFrameRow[],
  currentFrame?: RawFrameRow | null
): BitHeatmapData | null {
  const eligible = frames.filter(isHeatmapEligible).sort((a, b) => a.timeUs - b.timeUs);
  if (eligible.length < 2) return null;

  let byteCount = 0;
  for (const frame of eligible) {
    byteCount = Math.max(byteCount, frame.dlc, frame.dataBytes.length);
  }
  if (byteCount <= 0) return null;

  const flipCounts: number[][] = Array.from({ length: byteCount }, () =>
    Array.from({ length: 8 }, () => 0)
  );

  for (let i = 1; i < eligible.length; i += 1) {
    const prev = eligible[i - 1]!.dataBytes;
    const next = eligible[i]!.dataBytes;
    const bytes = Math.max(prev.length, next.length, byteCount);
    for (let byteIndex = 0; byteIndex < bytes; byteIndex += 1) {
      for (let bitInByte = 0; bitInByte < 8; bitInByte += 1) {
        if (readBit(prev, byteIndex, bitInByte) !== readBit(next, byteIndex, bitInByte)) {
          flipCounts[byteIndex]![bitInByte]! += 1;
        }
      }
    }
  }

  let maxFlipCount = 0;
  for (const row of flipCounts) {
    for (const count of row) {
      if (count > maxFlipCount) maxFlipCount = count;
    }
  }

  const grid: BitHeatmapCell[][] = [];
  for (let byteIndex = 0; byteIndex < byteCount; byteIndex += 1) {
    const row: BitHeatmapCell[] = [];
    for (let col = 0; col < 8; col += 1) {
      const bitInByte = 7 - col;
      const flipCount = flipCounts[byteIndex]?.[bitInByte] ?? 0;
      const intensity = maxFlipCount > 0 ? flipCount / maxFlipCount : 0;
      const currentValue =
        currentFrame && isHeatmapEligible(currentFrame)
          ? readBit(currentFrame.dataBytes, byteIndex, bitInByte)
          : null;
      row.push({
        byteIndex,
        bitInByte,
        flipCount,
        intensity,
        currentValue,
      });
    }
    grid.push(row);
  }

  return {
    byteCount,
    grid,
    frameCount: eligible.length,
    comparedPairs: eligible.length - 1,
    maxFlipCount,
  };
}

export function bitHeatmapCellClass(intensity: number): string {
  if (intensity <= 0) {
    return 'border-border/70 bg-muted/45 text-muted-foreground/60 dark:bg-muted/70';
  }
  if (intensity < 0.2) {
    return 'border-teal-500/35 bg-teal-500/18 text-teal-800 dark:text-teal-200';
  }
  if (intensity < 0.45) {
    return 'border-emerald-500/40 bg-emerald-500/28 text-emerald-900 dark:text-emerald-100';
  }
  if (intensity < 0.7) {
    return 'border-amber-500/45 bg-amber-500/35 text-amber-950 dark:text-amber-50';
  }
  return 'border-orange-500/55 bg-orange-500/50 text-orange-950 dark:text-orange-50';
}
