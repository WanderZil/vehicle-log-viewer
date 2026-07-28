import type { RawFrameRow } from '@/modules/analyses/types';

export type SparklineSeries = {
  /** Normalized 0–1 samples for SVG path (length ≥ 2 when drawable). */
  points: number[];
  min: number;
  max: number;
  /** Frame count for this message in the source set. */
  count: number;
};

export const SPARKLINE_WIDTH = 52;
export const SPARKLINE_HEIGHT = 20;
export const SPARKLINE_MAX_SAMPLES = 48;

export function messageSparkKey(channel: number, arbitrationId: number): string {
  return `${channel}:${arbitrationId}`;
}

/** Representative payload byte for quick activity preview (first data byte). */
function sparklineValue(row: RawFrameRow): number {
  if (row.isError || row.isRemote) return 0;
  return row.dataBytes[0] ?? 0;
}

function downsampleValues(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values.slice();
  const step = values.length / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(values[Math.min(values.length - 1, Math.floor(i * step))]!);
  }
  if (out[out.length - 1] !== values[values.length - 1]) {
    out[out.length - 1] = values[values.length - 1]!;
  }
  return out;
}

/**
 * Build per-message sparklines from frame rows (typically full `rawFrames`).
 * Each series uses the first payload byte over time — enough to spot motion and range.
 */
export function buildMessageSparklines(
  rows: RawFrameRow[],
  maxPoints = SPARKLINE_MAX_SAMPLES
): Map<string, SparklineSeries> {
  const valuesByKey = new Map<string, number[]>();

  for (const row of rows) {
    const key = messageSparkKey(row.channel, row.arbitrationId);
    const list = valuesByKey.get(key);
    if (list) list.push(sparklineValue(row));
    else valuesByKey.set(key, [sparklineValue(row)]);
  }

  const out = new Map<string, SparklineSeries>();
  for (const [key, values] of valuesByKey) {
    if (values.length === 0) continue;
    const sampled = downsampleValues(values, maxPoints);
    let min = sampled[0]!;
    let max = sampled[0]!;
    for (const v of sampled) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min;
    const points =
      span > 0
        ? sampled.map((v) => (v - min) / span)
        : sampled.map(() => 0.5);
    out.set(key, { points, min, max, count: values.length });
  }

  return out;
}

export function sparklinePathD(points: number[], width: number, height: number): string | null {
  if (points.length < 2) return null;
  const pad = 1;
  const innerH = height - pad * 2;
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const x = (i / (points.length - 1)) * width;
    const y = pad + innerH - points[i]! * innerH;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return parts.join(' ');
}
