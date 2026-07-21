import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { DecodedSignalValue, RawFrameRow } from '@/modules/analyses/types';

import { TRACE, channelBadgeClass } from './trace-colors';

function formatTraceTime(us: number) {
  const totalMs = Math.max(0, Math.floor(us / 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function formatSignalValue(sig: DecodedSignalValue) {
  if (!Number.isFinite(sig.value)) return '-';
  return String(sig.value);
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}`);
  }
}

function MetaRow({
  label,
  value,
  mono = false,
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 py-0.5 text-xs">
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-all',
          mono && 'font-mono tabular-nums',
          valueClassName
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function FrameDetailPanel({
  row,
  decoded,
}: {
  row: RawFrameRow | null;
  decoded: { messageName: string; signals: DecodedSignalValue[] } | null;
}) {
  if (!row) {
    return (
      <aside className="text-muted-foreground bg-muted/10 flex h-full items-center justify-center border-l px-6 text-center text-sm">
        Select a row to inspect decoded signals and frame bytes.
      </aside>
    );
  }

  const flags = [
    row.isExtended ? 'EXT' : null,
    row.isRemote ? 'RTR' : null,
    row.isError ? 'ERR' : null,
    row.isFd ? 'FD' : null,
    row.isBrs ? 'BRS' : null,
    row.isEsi ? 'ESI' : null,
  ].filter(Boolean);

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col overflow-hidden border-l">
      <div className="border-border shrink-0 border-b px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold tracking-tight">Frame detail</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn('rounded font-mono text-[10px]', TRACE.id)}
              >
                0x{row.arbitrationId.toString(16).toUpperCase()}
              </Badge>
              <Badge
                variant="outline"
                className={cn('rounded font-mono text-[10px]', channelBadgeClass(row.channel))}
              >
                CAN {row.channel}
              </Badge>
              {(decoded?.messageName || row.messageName) && (
                <Badge
                  variant="outline"
                  className={cn(
                    'max-w-[140px] truncate rounded text-[10px]',
                    TRACE.frame
                  )}
                >
                  {decoded?.messageName || row.messageName}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  'rounded font-mono text-[10px]',
                  row.dir === 'Tx' ? TRACE.txBadge : TRACE.rxBadge
                )}
              >
                {row.dir}
              </Badge>
              {row.isFd && (
                <Badge variant="outline" className={cn('rounded text-[10px]', TRACE.fdBadge)}>
                  FD
                </Badge>
              )}
              {row.isBrs && (
                <Badge variant="outline" className={cn('rounded text-[10px]', TRACE.brsBadge)}>
                  BRS
                </Badge>
              )}
              {row.isEsi && (
                <Badge variant="outline" className={cn('rounded text-[10px]', TRACE.esiBadge)}>
                  ESI
                </Badge>
              )}
              {row.isError && (
                <Badge variant="outline" className={cn('rounded text-[10px]', TRACE.errBadge)}>
                  ERR
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-md px-2"
              onClick={() =>
                void copyText(row.arbitrationId.toString(16).toUpperCase(), 'Arbitration ID')
              }
              aria-label="Copy arbitration ID"
            >
              <Copy className="size-3.5" />
              ID
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-md px-2"
              onClick={() => void copyText(row.data, 'Data bytes')}
              aria-label="Copy data bytes"
            >
              <Copy className="size-3.5" />
              Data
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3
              className={cn(
                'font-mono text-[10px] font-medium tracking-wide uppercase',
                TRACE.section
              )}
            >
              Signals
            </h3>
            {decoded && (
              <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px] tabular-nums">
                {decoded.signals.length}
              </span>
            )}
          </div>

          {!decoded ? (
            <div className="border-border bg-muted/20 rounded-md border px-3 py-4 text-center">
              <p className="text-muted-foreground text-xs leading-relaxed">
                No DBC match for this frame. Map a DBC to this channel and parse to decode signal
                values.
              </p>
            </div>
          ) : decoded.signals.length === 0 ? (
            <div className="border-border bg-muted/20 rounded-md border px-3 py-4 text-center">
              <p className={cn('mb-1 text-xs font-medium', TRACE.frame)}>
                {decoded.messageName}
              </p>
              <p className="text-muted-foreground text-xs">Message has no signals in the DBC.</p>
            </div>
          ) : (
            <div className="border-border overflow-hidden rounded-md border">
              <table className="w-full table-fixed text-left">
                <thead>
                  <tr className="bg-muted/50 border-border border-b">
                    <th className="text-muted-foreground w-[36%] px-2 py-1.5 font-mono text-[10px] font-medium tracking-wide uppercase">
                      Signal
                    </th>
                    <th className="text-muted-foreground w-[28%] px-2 py-1.5 text-center font-mono text-[10px] font-medium tracking-wide uppercase">
                      Enum
                    </th>
                    <th className="text-muted-foreground w-[20%] px-2 py-1.5 text-center font-mono text-[10px] font-medium tracking-wide uppercase">
                      Value
                    </th>
                    <th className="text-muted-foreground w-[16%] px-2 py-1.5 text-center font-mono text-[10px] font-medium tracking-wide uppercase">
                      Unit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {decoded.signals.map((sig) => (
                    <tr
                      key={sig.name}
                      className="border-border/60 hover:bg-muted/25 border-b last:border-0"
                      title={sig.description ?? undefined}
                    >
                      <td
                        className={cn(
                          'truncate px-2 py-1.5 text-xs font-medium',
                          TRACE.signal
                        )}
                      >
                        {sig.name}
                      </td>
                      <td
                        className={cn(
                          'truncate px-2 py-1.5 text-center text-xs',
                          sig.choiceLabel ? TRACE.enum : 'text-muted-foreground'
                        )}
                        title={sig.choiceLabel ?? undefined}
                      >
                        {sig.choiceLabel || '-'}
                      </td>
                      <td
                        className={cn(
                          'truncate px-2 py-1.5 text-center font-mono text-xs tabular-nums',
                          TRACE.value
                        )}
                      >
                        {formatSignalValue(sig)}
                      </td>
                      <td className="text-muted-foreground truncate px-2 py-1.5 text-center text-xs">
                        {sig.unit || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Separator className="my-3" />

        <section>
          <h3
            className={cn(
              'mb-1.5 font-mono text-[10px] font-medium tracking-wide uppercase',
              TRACE.section
            )}
          >
            Frame
          </h3>
          <dl>
            <MetaRow
              label="Time"
              value={formatTraceTime(row.timeUs)}
              mono
              valueClassName={TRACE.time}
            />
            <MetaRow
              label="ID (dec)"
              value={String(row.arbitrationId)}
              mono
              valueClassName={TRACE.id}
            />
            <MetaRow label="DLC" value={String(row.dlc)} mono />
            {row.nodeName && (
              <MetaRow label="Node" value={row.nodeName} valueClassName={TRACE.node} />
            )}
            {flags.length > 0 && (
              <MetaRow
                label="Flags"
                value={flags.join(' · ')}
                valueClassName={
                  row.isError
                    ? 'text-destructive'
                    : row.isFd
                      ? 'text-amber-700 dark:text-amber-400'
                      : undefined
                }
              />
            )}
          </dl>
        </section>

        <Separator className="my-3" />

        <section>
          <h3
            className={cn(
              'mb-1.5 font-mono text-[10px] font-medium tracking-wide uppercase',
              TRACE.section
            )}
          >
            Payload
          </h3>
          {row.dataBytes.length === 0 ? (
            <p className="text-muted-foreground text-xs">No payload</p>
          ) : (
            <div className="border-border overflow-hidden rounded-md border">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="bg-muted/40 border-border border-b text-[10px] uppercase">
                    <th className="text-muted-foreground w-8 px-2 py-1 text-center font-medium">
                      #
                    </th>
                    <th className="text-muted-foreground px-2 py-1 text-center font-medium">
                      Hex
                    </th>
                    <th className="text-muted-foreground px-2 py-1 text-center font-medium">
                      Dec
                    </th>
                    <th className="text-muted-foreground px-2 py-1 text-center font-medium">
                      Bin
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {row.dataBytes.map((byte, index) => (
                    <tr
                      key={`${row.rowId}-${index}`}
                      className="border-border/60 hover:bg-muted/30 border-b last:border-0"
                    >
                      <td className="text-muted-foreground px-2 py-1 text-center tabular-nums">
                        {index}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1 text-center font-semibold tabular-nums',
                          TRACE.hex
                        )}
                      >
                        {byte.toString(16).toUpperCase().padStart(2, '0')}
                      </td>
                      <td className="text-muted-foreground px-2 py-1 text-center tabular-nums">
                        {byte}
                      </td>
                      <td className={cn('px-2 py-1 text-center tabular-nums', TRACE.time)}>
                        {byte.toString(2).padStart(8, '0')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
