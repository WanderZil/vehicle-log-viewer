import { cn } from '@/lib/utils';
import type { DbcMessageRow } from '@/lib/can/dbc-catalog';
import { m } from '@/paraglide/messages.js';

import { TRACE } from '@/blocks/frame-viewer/trace-colors';

export function DbcMessageList({
  messages,
  selectedName,
  onSelect,
}: {
  messages: DbcMessageRow[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-sm">
        {m['analyses.dbc_viewer.no_messages']()}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <table className="w-full table-fixed border-collapse text-center text-[11px]">
        <colgroup>
          <col className="w-[32%]" />
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[18%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
          <tr>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_name']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_id']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_dlc']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_tx']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_cycle']()}</th>
            <th className="px-2 py-1.5 text-center font-medium">{m['analyses.dbc_viewer.col_signals']()}</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((msg, rowIndex) => {
            const selected = msg.name === selectedName;
            return (
              <tr
                key={msg.name}
                className={cn(
                  'border-border/50 cursor-pointer border-t',
                  selected
                    ? 'bg-primary/12'
                    : rowIndex % 2 === 0
                      ? 'bg-background hover:bg-muted/45'
                      : 'bg-muted/15 hover:bg-muted/45'
                )}
                onClick={() => onSelect(msg.name)}
              >
                <td
                  className={cn('truncate px-2 py-1 font-semibold', TRACE.frame)}
                  title={msg.name}
                >
                  {msg.name}
                </td>
                <td
                  className={cn(
                    'truncate px-2 py-1 font-mono font-semibold tabular-nums',
                    TRACE.id
                  )}
                  title={msg.idHex}
                >
                  {msg.idHex}
                </td>
                <td className={cn('truncate px-2 py-1 font-mono tabular-nums', TRACE.dlc)}>
                  {msg.dlc}
                </td>
                <td
                  className={cn('truncate px-2 py-1 font-semibold', TRACE.node)}
                  title={msg.sendingNode}
                >
                  {msg.sendingNode || '—'}
                </td>
                <td
                  className={cn('truncate px-2 py-1 font-mono tabular-nums', TRACE.time)}
                  title={msg.cycleLabel}
                >
                  {msg.cycleLabel}
                </td>
                <td className={cn('truncate px-2 py-1 font-mono tabular-nums', TRACE.value)}>
                  {msg.signalCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
