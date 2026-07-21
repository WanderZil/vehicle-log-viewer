import type { CSSProperties } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Checkbox } from '@/components/ui/checkbox';

import type { SignalTableRow } from './signal-table-types';
import {
  formatHex,
  formatSignalDisplayValue,
  formatValue,
  type Series,
  type ViewMode,
  valueAt,
} from './use-signal-workspace';
import { signalColorForRow } from './signal-context-menu';

export type SignalTableMeta = {
  series: Series[];
  mainTime: number;
  diffTime: number;
  mainCursorActive: boolean;
  diffCursorActive: boolean;
  diffOn: boolean;
  groupPickMode: boolean;
  groupPickIds: Record<string, true>;
  isSignalVisible: (id: string) => boolean;
  onToggleVisible: (id: string) => void;
  onToggleGroupPick: (id: string) => void;
  onRemove: (id: string) => void;
};

const compactHead =
  'h-8 border-border/70 border-r px-2 py-1 text-center text-[10px] font-semibold uppercase last:border-r-0';
const compactCell =
  'border-border/60 border-r px-2 py-1 text-center text-[11px] last:border-r-0';
const fixedCol =
  'w-7 min-w-7 max-w-7 border-border/70 border-r p-0 text-center last:border-r-0';

function ResizeHandle({
  onDoubleClick,
  onMouseDown,
  onTouchStart,
  isResizing,
}: {
  onDoubleClick: () => void;
  onMouseDown: (event: unknown) => void;
  onTouchStart: (event: unknown) => void;
  isResizing: boolean;
}) {
  return (
    <div
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={cn(
        'absolute top-0 right-0 z-10 hidden h-full w-1.5 translate-x-1/2 cursor-col-resize touch-none select-none md:block',
        isResizing && 'bg-primary/60'
      )}
    />
  );
}

function DataHeader({
  label,
  header,
}: {
  label: string;
  header: {
    column: {
      getCanResize: () => boolean;
      getIsResizing: () => boolean;
      resetSize: () => void;
    };
    getResizeHandler: () => (event: unknown) => void;
  };
}) {
  return (
    <div className="relative text-center">
      {label}
      {header.column.getCanResize() && (
        <ResizeHandle
          onDoubleClick={() => header.column.resetSize()}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          isResizing={header.column.getIsResizing()}
        />
      )}
    </div>
  );
}

export function createSignalTableColumns(
  groupPickMode: boolean
): ColumnDef<SignalTableRow>[] {
  const columns: ColumnDef<SignalTableRow>[] = [];

  if (groupPickMode) {
    columns.push({
      id: 'groupPick',
      enableHiding: false,
      enableResizing: false,
      size: 28,
      minSize: 28,
      maxSize: 28,
      header: () => <span className="sr-only">{m['analyses.signals_group_create']()}</span>,
      cell: ({ row, table }) => {
        if (row.original.kind !== 'signal') return null;
        const { sig, grouped } = row.original;
        const meta = table.options.meta as SignalTableMeta;
        return (
          <div className="flex justify-center">
            <Checkbox
              checked={meta.groupPickIds[sig.id] === true}
              onCheckedChange={() => meta.onToggleGroupPick(sig.id)}
              aria-label={m['analyses.signals_group_pick_signal']({ name: sig.signalName })}
              className="size-3.5"
              disabled={grouped}
            />
          </div>
        );
      },
      meta: { className: fixedCol },
    });
  }

  columns.push(
    {
      id: 'plot',
      enableHiding: false,
      enableResizing: false,
      size: 28,
      minSize: 28,
      maxSize: 28,
      header: () => <span className="sr-only">{m['analyses.signals_visible_toggle']({ name: '' })}</span>,
      cell: ({ row, table }) => {
        if (row.original.kind !== 'signal') return null;
        const { sig, index } = row.original;
        const meta = table.options.meta as SignalTableMeta;
        const seriesEntry = meta.series.find((s) => s.signal.id === sig.id);
        const color = signalColorForRow(sig.id, index, seriesEntry?.color);
        const visible = meta.isSignalVisible(sig.id);
        return (
          <div className="flex justify-center">
            <Checkbox
              checked={visible}
              onCheckedChange={() => meta.onToggleVisible(sig.id)}
              aria-label={m['analyses.signals_visible_toggle']({ name: sig.signalName })}
              className={cn(
                'size-3.5 border-2 shadow-none',
                'data-checked:border-(--signal-swatch) data-checked:bg-(--signal-swatch)',
                'data-checked:text-white dark:data-checked:bg-(--signal-swatch)'
              )}
              style={
                {
                  '--signal-swatch': color,
                  borderColor: color,
                  backgroundColor: visible ? color : 'transparent',
                  color: visible ? '#fff' : undefined,
                } as CSSProperties
              }
            />
          </div>
        );
      },
      meta: { className: fixedCol },
    },
    {
      id: 'signal',
      accessorFn: (row) => (row.kind === 'signal' ? row.sig.signalName : ''),
      header: ({ header }) => (
        <DataHeader label={m['analyses.col_signal']()} header={header} />
      ),
      cell: ({ row }) => {
        if (row.original.kind !== 'signal') return null;
        const { sig, grouped } = row.original;
        const label = sig.messageName
          ? `${sig.messageName}::${sig.signalName}`
          : sig.signalName;
        return (
          <div
            className={cn('mx-auto max-w-[220px] truncate font-medium', grouped && 'pl-2')}
            title={label}
          >
            {sig.signalName}
          </div>
        );
      },
      size: 120,
      minSize: 72,
      meta: { className: compactCell, label: m['analyses.col_signal']() },
    },
    {
      id: 'message',
      accessorFn: (row) =>
        row.kind === 'signal' ? (row.sig.messageName ?? '') : '',
      header: ({ header }) => (
        <DataHeader label={m['analyses.col_message']()} header={header} />
      ),
      cell: ({ row }) => {
        if (row.original.kind !== 'signal') return null;
        const name = row.original.sig.messageName;
        return (
          <div className="mx-auto max-w-[160px] truncate" title={name ?? undefined}>
            {name || '--'}
          </div>
        );
      },
      size: 96,
      minSize: 56,
      meta: { className: compactCell, label: m['analyses.col_message']() },
    },
    {
      id: 'unit',
      accessorFn: (row) => (row.kind === 'signal' ? (row.sig.unit ?? '') : ''),
      header: ({ header }) => (
        <DataHeader label={m['analyses.col_unit']()} header={header} />
      ),
      cell: ({ row }) => {
        if (row.original.kind !== 'signal') return null;
        const unit = row.original.sig.unit;
        return <span className="text-muted-foreground">{unit || '--'}</span>;
      },
      size: 52,
      minSize: 40,
      meta: { className: compactCell, label: m['analyses.col_unit']() },
    },
    {
      id: 'description',
      accessorFn: (row) =>
        row.kind === 'signal' ? (row.sig.description ?? '') : '',
      header: ({ header }) => (
        <DataHeader label={m['analyses.col_description']()} header={header} />
      ),
      cell: ({ row }) => {
        if (row.original.kind !== 'signal') return null;
        const desc = row.original.sig.description;
        return (
          <div className="mx-auto max-w-[200px] truncate" title={desc ?? undefined}>
            {desc || '--'}
          </div>
        );
      },
      size: 120,
      minSize: 64,
      meta: { className: compactCell, label: m['analyses.col_description']() },
    },
    {
      id: 'y',
      header: ({ header }) => (
        <DataHeader label={m['analyses.col_y']()} header={header} />
      ),
      cell: ({ row, table }) => {
        if (row.original.kind !== 'signal') return null;
        const { sig, index } = row.original;
        const meta = table.options.meta as SignalTableMeta;
        const s = meta.series[index];
        const mainV =
          meta.mainCursorActive && s ? valueAt(s.points, meta.mainTime) : null;
        return (
          <div
            className="truncate text-center font-mono text-[10px] tabular-nums"
            title={mainV !== null ? formatSignalDisplayValue(mainV, sig) : undefined}
          >
            {mainV !== null ? formatSignalDisplayValue(mainV, sig) : '--'}
          </div>
        );
      },
      size: 64,
      minSize: 44,
      meta: { className: compactCell, label: m['analyses.col_y']() },
    },
    {
      id: 'dy',
      header: ({ header }) => (
        <DataHeader label={m['analyses.col_dy']()} header={header} />
      ),
      cell: ({ row, table }) => {
        if (row.original.kind !== 'signal') return null;
        const { index } = row.original;
        const meta = table.options.meta as SignalTableMeta;
        const s = meta.series[index];
        const mainV =
          meta.mainCursorActive && s ? valueAt(s.points, meta.mainTime) : null;
        const diffV =
          meta.diffCursorActive && s ? valueAt(s.points, meta.diffTime) : null;
        const delta = mainV !== null && diffV !== null ? mainV - diffV : null;
        return (
          <div
            className={cn(
              'truncate text-center font-mono text-[10px] tabular-nums',
              meta.diffCursorActive && delta !== null && 'text-amber-600 dark:text-amber-500'
            )}
          >
            {meta.diffCursorActive && delta !== null ? formatValue(delta) : '--'}
          </div>
        );
      },
      size: 52,
      minSize: 40,
      meta: { className: compactCell, label: m['analyses.col_dy']() },
    },
    {
      id: 'hex',
      header: ({ header }) => (
        <DataHeader label={m['analyses.col_hex']()} header={header} />
      ),
      cell: ({ row, table }) => {
        if (row.original.kind !== 'signal') return null;
        const { index } = row.original;
        const meta = table.options.meta as SignalTableMeta;
        const s = meta.series[index];
        const mainV =
          meta.mainCursorActive && s ? valueAt(s.points, meta.mainTime) : null;
        return (
          <div className="text-muted-foreground truncate text-center font-mono text-[10px] tabular-nums">
            {mainV !== null ? formatHex(mainV) : '--'}
          </div>
        );
      },
      size: 44,
      minSize: 36,
      meta: { className: compactCell, label: m['analyses.col_hex']() },
    },
    {
      id: 'actions',
      enableHiding: false,
      enableResizing: false,
      size: 24,
      minSize: 24,
      maxSize: 24,
      header: () => <span className="sr-only">{m['analyses.signals_remove']()}</span>,
      cell: ({ row, table }) => {
        if (row.original.kind !== 'signal') return null;
        const meta = table.options.meta as SignalTableMeta;
        return (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => meta.onRemove(row.original.sig.id)}
              aria-label={m['analyses.signals_remove']()}
              className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      },
      meta: {
        className: 'w-6 min-w-6 max-w-6 border-border/60 border-r p-0 text-center last:border-r-0',
      },
    }
  );

  return columns;
}

export { compactCell, compactHead };
