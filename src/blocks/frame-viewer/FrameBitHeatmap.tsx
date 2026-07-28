import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import type { RawFrameRow } from '@/modules/analyses/types';

import {
  bitHeatmapCellClass,
  buildMessageBitHeatmap,
} from './frame-bit-heatmap';

export function FrameBitHeatmap({
  frames,
  currentFrame,
  className,
}: {
  frames: RawFrameRow[];
  currentFrame: RawFrameRow;
  className?: string;
}) {
  const heatmap = useMemo(
    () => buildMessageBitHeatmap(frames, currentFrame),
    [frames, currentFrame]
  );

  if (!heatmap) {
    return (
      <p className={cn('text-muted-foreground text-xs leading-relaxed', className)}>
        {m['analyses.trace_bit_heatmap_empty']()}
      </p>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
          {m['analyses.trace_bit_heatmap_meta']({
            frames: heatmap.frameCount.toLocaleString(),
            pairs: heatmap.comparedPairs.toLocaleString(),
            max: String(heatmap.maxFlipCount),
          })}
        </p>
      </div>

      <div className="border-border overflow-x-auto rounded-md border p-1.5">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="text-muted-foreground px-1 py-0.5 text-center font-medium">
                {m['analyses.trace_bit_heatmap_byte']()}
              </th>
              {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
                <th
                  key={bit}
                  className="text-muted-foreground w-8 px-0.5 py-0.5 text-center font-mono font-medium"
                >
                  {bit}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.grid.map((row, byteIndex) => (
              <tr key={byteIndex}>
                <td className="text-muted-foreground px-1 py-0.5 text-center font-mono tabular-nums">
                  {byteIndex}
                </td>
                {row.map((cell) => {
                  const title = m['analyses.trace_bit_heatmap_tip']({
                    byte: String(cell.byteIndex),
                    bit: String(cell.bitInByte),
                    flips: String(cell.flipCount),
                    value:
                      cell.currentValue == null ? '—' : String(cell.currentValue),
                  });
                  return (
                    <td key={cell.bitInByte} className="p-0.5">
                      <div
                        title={title}
                        className={cn(
                          'flex h-6 w-8 flex-col items-center justify-center rounded-sm border font-mono text-[9px] leading-none',
                          bitHeatmapCellClass(cell.intensity),
                          cell.currentValue != null &&
                            'ring-primary/70 ring-1 ring-offset-1 ring-offset-background'
                        )}
                      >
                        <span className="font-semibold tabular-nums">
                          {cell.flipCount > 0 ? cell.flipCount : ''}
                        </span>
                        {cell.currentValue != null ? (
                          <span className="text-[8px] opacity-80">{cell.currentValue}</span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px]">
        <span>{m['analyses.trace_bit_heatmap_legend_quiet']()}</span>
        <span className="inline-flex items-center gap-1">
          <span className="border-border bg-muted/45 inline-block size-3 rounded-sm border" />
          <span className="border-teal-500/35 bg-teal-500/18 inline-block size-3 rounded-sm border" />
          <span className="border-emerald-500/40 bg-emerald-500/28 inline-block size-3 rounded-sm border" />
          <span className="border-amber-500/45 bg-amber-500/35 inline-block size-3 rounded-sm border" />
          <span className="border-orange-500/55 bg-orange-500/50 inline-block size-3 rounded-sm border" />
        </span>
        <span>{m['analyses.trace_bit_heatmap_legend_busy']()}</span>
      </div>
    </div>
  );
}
