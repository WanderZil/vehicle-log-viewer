import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { FolderPlus, Layers, Plus, Rows3, Trash2 } from 'lucide-react';

import type { SignalItem } from '@/modules/analyses/types';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { SignalContextMenu } from './signal-context-menu';
import {
  compactHead,
  createSignalTableColumns,
  type SignalTableMeta,
} from './signal-table-columns';
import { buildSignalTableRows } from './signal-table-types';
import { SignalTableViewOptions } from './signal-table-view-options';
import {
  formatCursorTime,
  PALETTE,
  type Series,
  type SignalGroup,
  type ViewMode,
} from './use-signal-workspace';

function groupHeaderStyle(groupIndex: number) {
  const color = PALETTE[groupIndex % PALETTE.length];
  return { backgroundColor: `${color}22` };
}

export function SignalTablePanel({
  added,
  series,
  hasDomain,
  tMin,
  mainTime,
  diffTime,
  mainCursorActive,
  diffCursorActive,
  diffOn,
  onRemove,
  onAddClick,
  isSignalVisible,
  onToggleVisible,
  groups,
  groupedSignalIds,
  groupPickMode,
  onGroupPickModeChange,
  groupPickIds,
  groupPickCount,
  onToggleGroupPick,
  onClearGroupPick,
  onCreateGroup,
  onDeleteGroup,
  onSetGroupViewMode,
  getSignalColor,
  onSetSignalColor,
  onResetSignalColor,
  hasCustomSignalColor,
}: {
  added: SignalItem[];
  series: Series[];
  hasDomain: boolean;
  tMin: number;
  mainTime: number;
  diffTime: number;
  mainCursorActive: boolean;
  diffCursorActive: boolean;
  diffOn: boolean;
  onRemove: (id: string) => void;
  onAddClick: () => void;
  isSignalVisible: (id: string) => boolean;
  onToggleVisible: (id: string) => void;
  groups: SignalGroup[];
  groupedSignalIds: Set<string>;
  groupPickMode: boolean;
  onGroupPickModeChange: (active: boolean) => void;
  groupPickIds: Record<string, true>;
  groupPickCount: number;
  onToggleGroupPick: (id: string) => void;
  onClearGroupPick: () => void;
  onCreateGroup: (name: string) => boolean;
  onDeleteGroup: (groupId: string) => void;
  onSetGroupViewMode: (groupId: string, mode: ViewMode) => void;
  getSignalColor: (signalId: string, index: number) => string;
  onSetSignalColor: (signalId: string, color: string) => void;
  onResetSignalColor: (signalId: string) => void;
  hasCustomSignalColor: (signalId: string) => boolean;
}) {
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [nameError, setNameError] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    message: false,
    unit: false,
    description: false,
  });

  const rows = useMemo(
    () => buildSignalTableRows(added, groups, groupedSignalIds),
    [added, groups, groupedSignalIds]
  );

  const columns = useMemo(
    () => createSignalTableColumns(groupPickMode),
    [groupPickMode]
  );

  const tableMeta = useMemo<SignalTableMeta>(
    () => ({
      series,
      mainTime,
      diffTime,
      mainCursorActive,
      diffCursorActive,
      diffOn,
      groupPickMode,
      groupPickIds,
      isSignalVisible,
      onToggleVisible,
      onToggleGroupPick,
      onRemove,
    }),
    [
      series,
      mainTime,
      diffTime,
      mainCursorActive,
      diffCursorActive,
      diffOn,
      groupPickMode,
      groupPickIds,
      isSignalVisible,
      onToggleVisible,
      onToggleGroupPick,
      onRemove,
    ]
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      columnVisibility,
    },
    meta: tableMeta,
  });

  const handleCreateGroup = () => {
    if (groupPickCount < 2) {
      setNameError(m['analyses.signals_group_min_signals']());
      return;
    }
    const ok = onCreateGroup(groupName);
    if (!ok) {
      setNameError(m['analyses.signals_group_create_error']());
      return;
    }
    setGroupName('');
    setNameError('');
    setNameDialogOpen(false);
  };

  const visibleLeafCount = table.getVisibleLeafColumns().length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border/60 flex shrink-0 items-center justify-end gap-1.5 border-b px-2 py-1.5">
        <Button
          type="button"
          size="xs"
          variant={groupPickMode ? 'default' : 'outline'}
          className="h-6 gap-1 px-2"
          onClick={() => {
            if (groupPickMode) onClearGroupPick();
            else onGroupPickModeChange(true);
          }}
        >
          <FolderPlus className="size-3" />
          {m['analyses.signals_group_create']()}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-6 gap-1 px-2"
          onClick={onAddClick}
        >
          <Plus className="size-3" />
          {m['analyses.signals_add']()}
        </Button>
        <SignalTableViewOptions table={table} className="ml-0" />
      </div>

      {groupPickMode && (
        <div className="border-border/60 bg-muted/20 flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
          <span className="text-muted-foreground text-[10px]">
            {m['analyses.signals_group_pick_hint']({ count: groupPickCount })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 px-2"
              onClick={onClearGroupPick}
            >
              {m['analyses.signals_group_cancel']()}
            </Button>
            <Button
              type="button"
              size="xs"
              className="h-6 px-2"
              disabled={groupPickCount < 2}
              onClick={() => {
                setGroupName('');
                setNameError('');
                setNameDialogOpen(true);
              }}
            >
              {m['analyses.signals_group_confirm']({ count: groupPickCount })}
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y">
        <Table
          className="min-w-full table-fixed text-xs"
          style={{ width: Math.max(table.getCenterTotalSize(), 240) }}
        >
          <TableHeader className="bg-muted/40 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      compactHead,
                      (header.column.columnDef.meta as { className?: string } | undefined)
                        ?.className,
                      header.column.getIsResizing() && 'select-none'
                    )}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={visibleLeafCount}
                  className="text-muted-foreground h-24 text-center text-xs"
                >
                  {m['analyses.signals_no_added']()}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                if (row.original.kind === 'group') {
                  const { group, groupIndex } = row.original;
                  return (
                    <TableRow
                      key={row.id}
                      className="hover:bg-transparent"
                      style={groupHeaderStyle(groupIndex)}
                    >
                      <TableCell
                        colSpan={visibleLeafCount}
                        className="px-2 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate font-semibold"
                            style={{ color: PALETTE[groupIndex % PALETTE.length] }}
                          >
                            {group.name}
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <div className="bg-muted/50 flex rounded border p-0.5">
                              <Button
                                type="button"
                                size="xs"
                                variant={group.viewMode === 'overlay' ? 'default' : 'ghost'}
                                className="h-5 px-1.5"
                                onClick={() => onSetGroupViewMode(group.id, 'overlay')}
                                title={m['analyses.view_mode_overlay']()}
                              >
                                <Layers className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant={group.viewMode === 'stacked' ? 'default' : 'ghost'}
                                className="h-5 px-1.5"
                                onClick={() => onSetGroupViewMode(group.id, 'stacked')}
                                title={m['analyses.view_mode_stacked']()}
                              >
                                <Rows3 className="size-3" />
                              </Button>
                            </div>
                            <button
                              type="button"
                              onClick={() => onDeleteGroup(group.id)}
                              aria-label={m['analyses.signals_group_delete']({ name: group.name })}
                              className="text-muted-foreground hover:text-destructive rounded p-0.5"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const signalRow = row.original;
                if (signalRow.kind !== 'signal') return null;
                const { sig, index } = signalRow;
                const seriesEntry = series.find((s) => s.signal.id === sig.id);
                const color = seriesEntry?.color ?? getSignalColor(sig.id, index);
                const visible = isSignalVisible(sig.id);
                const defaultColor = getSignalColor(sig.id, index);

                return (
                  <SignalContextMenu
                    key={row.id}
                    signal={sig}
                    index={index}
                    color={color}
                    visible={visible}
                    hasCustomColor={hasCustomSignalColor(sig.id)}
                    onSetColor={(next) => onSetSignalColor(sig.id, next)}
                    onResetColor={() => onResetSignalColor(sig.id)}
                    onToggleVisible={() => onToggleVisible(sig.id)}
                    onRemove={() => onRemove(sig.id)}
                  >
                    <TableRow className="group text-[11px]">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={
                            (cell.column.columnDef.meta as { className?: string } | undefined)
                              ?.className
                          }
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  </SignalContextMenu>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {hasDomain && (
        <div className="border-border/60 bg-muted/20 shrink-0 border-t px-2 py-1 font-mono text-[10px] tabular-nums">
          <div className="flex justify-between gap-2">
            <span>
              t0 = {mainCursorActive ? formatCursorTime(mainTime - tMin) : '--'}
            </span>
            {diffOn && (
              <span>
                t1 = {diffCursorActive ? formatCursorTime(diffTime - tMin) : '--'}
              </span>
            )}
          </div>
          {diffOn && diffCursorActive && mainCursorActive && (
            <div className="text-muted-foreground mt-0.5">
              dt = {formatCursorTime(mainTime - diffTime)}
            </div>
          )}
        </div>
      )}

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{m['analyses.signals_group_name_title']()}</DialogTitle>
          </DialogHeader>
          <Input
            value={groupName}
            onChange={(e) => {
              setGroupName(e.target.value);
              setNameError('');
            }}
            placeholder={m['analyses.signals_group_name_placeholder']()}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateGroup();
            }}
          />
          {nameError && <p className="text-destructive text-xs">{nameError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNameDialogOpen(false)}>
              {m['analyses.signals_group_cancel']()}
            </Button>
            <Button type="button" onClick={handleCreateGroup} disabled={!groupName.trim()}>
              {m['analyses.signals_group_save']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
