import { useMemo } from 'react';

import {
  buildFrameBitLayout,
  signalColor,
} from '@/blocks/dbc-viewer/bit-layout';
import { cn } from '@/lib/utils';
import type { DbcMessageRow } from '@/lib/can/dbc-catalog';
import { m } from '@/paraglide/messages.js';

export function DbcBitMatrix({
  message,
  selectedSignal,
  onSelectSignal,
}: {
  message: DbcMessageRow | null;
  selectedSignal: string | null;
  onSelectSignal: (name: string) => void;
}) {
  const layout = useMemo(
    () => (message ? buildFrameBitLayout(message) : null),
    [message]
  );

  if (!message || !layout) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
        {m['analyses.dbc_viewer.select_message']()}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          {m['analyses.dbc_viewer.bit_matrix']()}
        </p>
        <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
          {m['analyses.dbc_viewer.bit_matrix_meta']({
            bytes: layout.byteCount,
            signals: message.signalCount,
          })}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="inline-block min-w-full">
          <table className="border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="text-muted-foreground px-1 py-0.5 text-center font-medium">
                  {m['analyses.dbc_viewer.bit_matrix_byte']()}
                </th>
                {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
                  <th
                    key={bit}
                    className="text-muted-foreground w-9 px-0.5 py-0.5 text-center font-mono font-medium"
                  >
                    {bit}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {layout.grid.map((row, byteIndex) => (
                <tr key={byteIndex}>
                  <td className="text-muted-foreground px-1 py-0.5 text-center font-mono tabular-nums">
                    {byteIndex}
                  </td>
                  {row.map((cell) => {
                    const occupied = cell.signalName != null;
                    const selected =
                      occupied && cell.signalName === selectedSignal;
                    const dimmed =
                      selectedSignal != null &&
                      occupied &&
                      cell.signalName !== selectedSignal;
                    const color = occupied
                      ? signalColor(cell.signalIndex)
                      : null;
                    const title = occupied
                      ? `${cell.signalName} · byte ${cell.byteIndex} bit ${cell.bitInByte}`
                      : `byte ${cell.byteIndex} bit ${cell.bitInByte} (unused)`;

                    return (
                      <td key={cell.bitInByte} className="p-0.5">
                        <button
                          type="button"
                          title={title}
                          disabled={!occupied}
                          onClick={() => {
                            if (cell.signalName) onSelectSignal(cell.signalName);
                          }}
                          className={cn(
                            'flex h-7 w-9 items-center justify-center rounded-sm border font-mono text-[9px] transition-[opacity,filter]',
                            !occupied &&
                              'border-border bg-muted/55 text-muted-foreground/70 dark:bg-muted/80 dark:text-muted-foreground dark:border-border cursor-default',
                            occupied &&
                              color &&
                              `${color.bg} ${color.border} ${color.text} cursor-pointer hover:brightness-110`,
                            selected &&
                              'ring-primary ring-2 ring-offset-1 ring-offset-background',
                            dimmed && 'opacity-60 dark:opacity-70'
                          )}
                        >
                          {occupied ? cell.signalBit : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {layout.overlaps.length > 0 ? (
          <p className="text-destructive mt-2 text-[11px]">
            {m['analyses.dbc_viewer.bit_overlap']({ count: layout.overlaps.length })}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {message.signals.map((sig, index) => {
            const color = signalColor(index);
            const selected = sig.name === selectedSignal;
            return (
              <button
                key={sig.name}
                type="button"
                onClick={() => onSelectSignal(sig.name)}
                className={cn(
                  'inline-flex max-w-[160px] items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10px]',
                  color.bg,
                  color.border,
                  selected && 'ring-primary ring-2 ring-offset-1'
                )}
                title={sig.name}
              >
                <span className="truncate font-medium">{sig.name}</span>
                <span className="opacity-70 font-mono">
                  {sig.startBit}/{sig.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
