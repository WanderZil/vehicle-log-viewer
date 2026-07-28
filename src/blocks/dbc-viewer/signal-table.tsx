import { cn } from '@/lib/utils';
import { formatNumberCompact, type DbcSignalRow } from '@/lib/can/dbc-catalog';
import { m } from '@/paraglide/messages.js';

import { TRACE } from '@/blocks/frame-viewer/trace-colors';

export function DbcSignalTable({
  signals,
  selectedName,
  onSelect,
}: {
  signals: DbcSignalRow[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  if (signals.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-sm">
        {m['analyses.dbc_viewer.no_signals']()}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-center text-[11px]">
        <thead className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
          <tr>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_name']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_start']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_length']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_byte_order']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_value_type']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_factor']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_offset']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_min']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_max']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_unit']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_multiplex']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_comment']()}</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((sig, rowIndex) => {
            const selected = sig.name === selectedName;
            return (
              <tr
                key={sig.name}
                className={cn(
                  'border-border/50 cursor-pointer border-t',
                  selected
                    ? 'bg-primary/12'
                    : rowIndex % 2 === 0
                      ? 'bg-background hover:bg-muted/45'
                      : 'bg-muted/15 hover:bg-muted/45'
                )}
                onClick={() => onSelect(sig.name)}
              >
                <td
                  className={cn('max-w-[160px] truncate px-2 py-1 font-semibold', TRACE.signal)}
                  title={sig.name}
                >
                  {sig.name}
                </td>
                <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.hex)}>
                  {sig.startBit}
                </td>
                <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.dlc)}>
                  {sig.length}
                </td>
                <td className={cn('px-2 py-1 font-medium', TRACE.frame)}>{sig.endian}</td>
                <td className={cn('px-2 py-1 font-medium', TRACE.node)}>{sig.valueType}</td>
                <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.value)}>
                  {formatNumberCompact(sig.factor)}
                </td>
                <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.value)}>
                  {formatNumberCompact(sig.offset)}
                </td>
                <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.data)}>
                  {formatNumberCompact(sig.min)}
                </td>
                <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.data)}>
                  {formatNumberCompact(sig.max)}
                </td>
                <td
                  className={cn('max-w-[80px] truncate px-2 py-1 font-medium', TRACE.enum)}
                  title={sig.unit}
                >
                  {sig.unit || '—'}
                </td>
                <td className={cn('px-2 py-1 font-mono font-medium', TRACE.rx)}>
                  {sig.multiplex || '—'}
                </td>
                <td
                  className="text-muted-foreground max-w-[200px] truncate px-2 py-1"
                  title={sig.description}
                >
                  {sig.description || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
