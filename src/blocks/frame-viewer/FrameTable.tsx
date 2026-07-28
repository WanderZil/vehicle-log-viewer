import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ListTree } from 'lucide-react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import type { RawFrameRow } from '@/modules/analyses/types';

import { FrameSparkline } from './FrameSparkline';
import { messageSparkKey, type SparklineSeries } from './frame-sparkline';
import { TRACE, channelTone } from './trace-colors';

const ROW_H = 32;
const OVERSCAN = 12;
const GRID_TEMPLATE =
  '44px minmax(124px,0.86fr) 72px 48px 84px minmax(88px,0.9fr) 56px 44px 36px minmax(160px,1.28fr)';
const GRID_CLASS = 'grid items-center gap-x-2 px-3';

function formatTraceTime(us: number) {
  const totalMs = Math.max(0, Math.floor(us / 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function DirChip({ dir }: { dir: 'Rx' | 'Tx' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-8 items-center justify-center rounded px-1 font-mono text-[10px] font-semibold tracking-wide uppercase',
        dir === 'Rx' ? TRACE.rxBadge : TRACE.txBadge
      )}
    >
      {dir}
    </span>
  );
}

export function FrameTable({
  rows,
  sparklines,
  selectedRowId,
  onSelect,
  timeDesc,
  onToggleTimeSort,
  scrollToRowId,
}: {
  rows: RawFrameRow[];
  sparklines: Map<string, SparklineSeries>;
  selectedRowId: number | null;
  onSelect: (row: RawFrameRow) => void;
  timeDesc: boolean;
  onToggleTimeSort: () => void;
  scrollToRowId?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollToRowId == null) return;
    const idx = rows.findIndex((row) => row.rowId === scrollToRowId);
    if (idx < 0) return;
    const el = containerRef.current;
    if (!el) return;
    const top = idx * ROW_H;
    const bottom = top + ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = bottom - el.clientHeight;
    }
  }, [scrollToRowId, rows]);

  const { start, end, offsetY, totalH } = useMemo(() => {
    const visible = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const endIdx = Math.min(rows.length, startIdx + visible);
    return {
      start: startIdx,
      end: endIdx,
      offsetY: startIdx * ROW_H,
      totalH: rows.length * ROW_H,
    };
  }, [rows.length, scrollTop, viewportH]);

  const visibleRows = rows.slice(start, end);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={cn(
          GRID_CLASS,
          'bg-muted/50 border-border text-muted-foreground shrink-0 border-b py-2 font-mono text-[10px] font-medium tracking-wide uppercase'
        )}
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <div>#</div>
        <button
          type="button"
          className="hover:text-foreground inline-flex items-center gap-1 text-left transition-colors"
          onClick={onToggleTimeSort}
        >
          Time
          {timeDesc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
        </button>
        <div>Node</div>
        <div>Ch</div>
        <div>ID</div>
        <div>Frame</div>
        <div>{m['analyses.frame_sparkline']()}</div>
        <div>Dir</div>
        <div>DLC</div>
        <div>Data</div>
      </div>

      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollTop(el.scrollTop);
          setViewportH(el.clientHeight);
        }}
      >
        {rows.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListTree />
              </EmptyMedia>
              <EmptyTitle>No frames yet</EmptyTitle>
              <EmptyDescription>
                Load a BLF file to populate the trace. Node and Frame names appear after DBC
                mapping and parse.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div style={{ height: totalH, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleRows.map((row, visibleIndex) => {
                const selected = row.rowId === selectedRowId;
                const rowIndex = start + visibleIndex;
                return (
                  <button
                    key={row.rowId}
                    type="button"
                    onClick={() => onSelect(row)}
                    className={cn(
                      GRID_CLASS,
                      'border-border/60 w-full border-b text-left font-mono text-[12px] transition-colors',
                      selected
                        ? 'border-l-primary bg-primary/12 border-l-2'
                        : rowIndex % 2 === 0
                          ? 'bg-background hover:bg-muted/45'
                          : 'bg-muted/15 hover:bg-muted/45'
                    )}
                    style={{ height: ROW_H, gridTemplateColumns: GRID_TEMPLATE }}
                  >
                    <div className="text-muted-foreground/80 tabular-nums">{rowIndex + 1}</div>
                    <div className={cn('tabular-nums', TRACE.time)}>
                      {formatTraceTime(row.timeUs)}
                    </div>
                    <div className={cn('truncate font-semibold', TRACE.node)}>
                      {row.nodeName ?? '-'}
                    </div>
                    <div className={cn('font-semibold tabular-nums', channelTone(row.channel))}>
                      {row.channel}
                    </div>
                    <div className={cn('font-semibold tabular-nums', TRACE.id)}>
                      0x{row.arbitrationId.toString(16).toUpperCase()}
                    </div>
                    <div className={cn('truncate text-[11px] font-medium', TRACE.frame)}>
                      {row.messageName ?? '-'}
                    </div>
                    <div className="flex items-center justify-center">
                      <FrameSparkline
                        series={sparklines.get(
                          messageSparkKey(row.channel, row.arbitrationId)
                        )}
                      />
                    </div>
                    <div>
                      <DirChip dir={row.dir} />
                    </div>
                    <div className={cn('tabular-nums', TRACE.dlc)}>{row.dlc}</div>
                    <div className={cn('overflow-hidden text-[11px] whitespace-nowrap', TRACE.data)}>
                      {row.data}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
