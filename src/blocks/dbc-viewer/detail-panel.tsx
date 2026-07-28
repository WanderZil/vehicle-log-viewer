import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  formatCanIdDisplay,
  formatNumberCompact,
  type DbcAttrRow,
  type DbcChoiceRow,
  type DbcMessageRow,
  type DbcSignalRow,
} from '@/lib/can/dbc-catalog';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';

import { TRACE } from '@/blocks/frame-viewer/trace-colors';

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
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 py-0.5 text-xs">
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-all',
          mono && 'font-mono tabular-nums',
          valueClassName
        )}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

function AttrTable({ rows }: { rows: DbcAttrRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground px-1 py-2 text-xs">
        {m['analyses.dbc_viewer.no_attributes']()}
      </p>
    );
  }
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[420px] border-collapse text-center text-[11px]">
        <thead className="bg-muted/40 text-muted-foreground sticky top-0">
          <tr>
            <th className="px-2 py-1 text-center font-medium">{m['analyses.dbc_viewer.attr_name']()}</th>
            <th className="px-2 py-1 text-center font-medium">{m['analyses.dbc_viewer.attr_value']()}</th>
            <th className="px-2 py-1 text-center font-medium">{m['analyses.dbc_viewer.attr_type']()}</th>
            <th className="px-2 py-1 text-center font-medium">{m['analyses.dbc_viewer.attr_datatype']()}</th>
            <th className="px-2 py-1 text-center font-medium">{m['analyses.dbc_viewer.attr_default']()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-border/60 border-t">
              <td className={cn('px-2 py-1 font-mono font-medium', TRACE.signal)}>{row.name}</td>
              <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.value)}>
                {row.value || '—'}
              </td>
              <td className={cn('px-2 py-1', TRACE.frame)}>{row.type || '—'}</td>
              <td className={cn('px-2 py-1', TRACE.node)}>{row.dataType || '—'}</td>
              <td className={cn('px-2 py-1 font-mono', TRACE.hex)}>
                {row.defaultValue || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChoiceTable({ rows }: { rows: DbcChoiceRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground px-1 py-2 text-xs">
        {m['analyses.dbc_viewer.no_choices']()}
      </p>
    );
  }
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[240px] border-collapse text-center text-[11px]">
        <thead className="bg-muted/40 text-muted-foreground sticky top-0">
          <tr>
            <th className="px-2 py-1 text-center font-medium">{m['analyses.dbc_viewer.choice_value']()}</th>
            <th className="px-2 py-1 text-center font-medium">{m['analyses.dbc_viewer.choice_label']()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.value}-${row.label}`} className="border-border/60 border-t">
              <td className={cn('px-2 py-1 font-mono tabular-nums', TRACE.hex)}>{row.value}</td>
              <td className={cn('px-2 py-1 font-medium', TRACE.enum)}>{row.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DbcSignalDetailPanel({
  message,
  signal,
  onClose,
}: {
  message: DbcMessageRow;
  signal: DbcSignalRow;
  onClose: () => void;
}) {
  return (
    <aside className="bg-background flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold', TRACE.signal)}>{signal.name}</p>
          <p className={cn('mt-0.5 truncate font-mono text-[11px] tabular-nums', TRACE.id)}>
            {message.name} · {formatCanIdDisplay(message)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={onClose}
          aria-label={m['analyses.dbc_viewer.close_detail']()}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <section>
          <h3 className={cn('mb-1 text-xs font-semibold tracking-wide uppercase', TRACE.section)}>
            {m['analyses.dbc_viewer.signal_props']()}
          </h3>
          <dl>
            <MetaRow
              label={m['analyses.dbc_viewer.col_name']()}
              value={signal.name}
              valueClassName={cn('font-semibold', TRACE.signal)}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_start']()}
              value={String(signal.startBit)}
              mono
              valueClassName={TRACE.hex}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_length']()}
              value={String(signal.length)}
              mono
              valueClassName={TRACE.dlc}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_byte_order']()}
              value={signal.endian}
              valueClassName={cn('font-medium', TRACE.frame)}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_value_type']()}
              value={signal.valueType}
              valueClassName={cn('font-medium', TRACE.node)}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_factor']()}
              value={formatNumberCompact(signal.factor)}
              mono
              valueClassName={TRACE.value}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_offset']()}
              value={formatNumberCompact(signal.offset)}
              mono
              valueClassName={TRACE.value}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_min']()}
              value={formatNumberCompact(signal.min)}
              mono
              valueClassName={TRACE.data}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_max']()}
              value={formatNumberCompact(signal.max)}
              mono
              valueClassName={TRACE.data}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_unit']()}
              value={signal.unit}
              valueClassName={cn('font-medium', TRACE.enum)}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_multiplex']()}
              value={signal.multiplex}
              valueClassName={cn('font-mono font-medium', TRACE.rx)}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_receivers']()}
              value={signal.receivingNodes.join(', ')}
              valueClassName={TRACE.node}
            />
            <MetaRow
              label={m['analyses.dbc_viewer.col_comment']()}
              value={signal.description}
            />
          </dl>
        </section>

        <section>
          <h3 className={cn('mb-1 text-xs font-semibold tracking-wide uppercase', TRACE.section)}>
            {m['analyses.dbc_viewer.choices']()}
          </h3>
          <ChoiceTable rows={signal.choices} />
        </section>

        <section>
          <h3 className={cn('mb-1 text-xs font-semibold tracking-wide uppercase', TRACE.section)}>
            {m['analyses.dbc_viewer.attributes']()}
          </h3>
          <AttrTable rows={signal.attributes} />
        </section>
      </div>
    </aside>
  );
}
