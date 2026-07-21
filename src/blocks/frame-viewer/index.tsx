import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { FrameDetailPanel } from '@/blocks/frame-viewer/FrameDetailPanel';
import { FrameFilterButton } from '@/blocks/frame-viewer/frame-filter-button';
import { FrameTable } from '@/blocks/frame-viewer/FrameTable';
import {
  applyFrameFilters,
  buildSearchMatches,
  getFrameTimeDomain,
  type FrameFilterState,
  type FrameSearchState,
} from '@/blocks/frame-viewer/frame-filter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClientAnalysisSession } from '@/hooks/use-client-analysis-session';
import { cn } from '@/lib/utils';
import { getClientSession } from '@/modules/analyses/client-session';
import type { RawFrameRow } from '@/modules/analyses/types';

const EMPTY_FILTER: FrameFilterState = {
  idQuery: '',
  channel: 'all',
  type: 'all',
  dataQuery: '',
  timeFromSec: '',
  timeToSec: '',
};

const EMPTY_SEARCH: FrameSearchState = {
  idQuery: '',
  dataQuery: '',
};

function formatDomainSec(us: number) {
  return (us / 1_000_000).toFixed(3);
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}`);
  }
}

export function FrameViewer() {
  const snap = useClientAnalysisSession();
  const session = getClientSession();
  const [filter, setFilter] = useState<FrameFilterState>(EMPTY_FILTER);
  const [search, setSearch] = useState<FrameSearchState>(EMPTY_SEARCH);
  const [timeDesc, setTimeDesc] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [matchCursor, setMatchCursor] = useState(0);
  const [scrollToRowId, setScrollToRowId] = useState<number | null>(null);

  const timeDomain = useMemo(() => getFrameTimeDomain(snap.rawFrames), [snap.rawFrames]);

  useEffect(() => {
    setFilter((prev) => ({
      ...prev,
      idQuery: '',
      dataQuery: '',
      timeFromSec: '',
      timeToSec: '',
    }));
  }, [snap.blfFileName, snap.rawFrames.length]);

  const filteredRows = useMemo(() => {
    const base = applyFrameFilters(snap.rawFrames, filter);
    if (!timeDesc) return base;
    return [...base].sort((a, b) => b.timeUs - a.timeUs);
  }, [snap.rawFrames, filter, timeDesc]);

  const selectedRow =
    filteredRows.find((row) => row.rowId === selectedRowId) ?? filteredRows[0] ?? null;

  useEffect(() => {
    if (!selectedRow) {
      setSelectedRowId(null);
      return;
    }
    if (selectedRow.rowId !== selectedRowId) setSelectedRowId(selectedRow.rowId);
  }, [selectedRow, selectedRowId]);

  const matches = useMemo(
    () => buildSearchMatches(filteredRows, search),
    [filteredRows, search]
  );

  useEffect(() => {
    setMatchCursor(0);
  }, [search.idQuery, search.dataQuery, filteredRows.length]);

  const decoded = useMemo(() => {
    if (!selectedRow) return null;
    return session.decodeFrame(selectedRow);
  }, [selectedRow, session, snap.channelMapping, snap.dbcItems.length, snap.status]);

  const durationUs = timeDomain ? timeDomain.maxUs - timeDomain.minUs : 0;

  const jumpMatch = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    const next =
      (matchCursor + direction + matches.length * 10) % matches.length;
    setMatchCursor(next);
    const row = filteredRows[matches[next]!];
    if (row) {
      setSelectedRowId(row.rowId);
      setScrollToRowId(row.rowId);
    }
  };

  const onSelect = (row: RawFrameRow) => {
    setSelectedRowId(row.rowId);
    setScrollToRowId(null);
  };

  return (
    <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-border bg-instrument flex h-9 shrink-0 flex-wrap items-center gap-2 border-b px-2">
        <div className="text-xs font-semibold tracking-tight">Raw Frames</div>
        <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
          <span>
            <span className="text-muted-foreground">shown </span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              {filteredRows.length.toLocaleString()}
            </span>
          </span>
          <span className="text-border">/</span>
          <span>
            <span className="text-muted-foreground">total </span>
            <span className="text-sky-600 dark:text-sky-400 font-semibold">
              {snap.rawFrames.length.toLocaleString()}
            </span>
          </span>
          {timeDomain && (
            <span>
              <span className="text-muted-foreground">· </span>
              <span className="text-teal-600 dark:text-teal-400 font-semibold">
                {formatDomainSec(timeDomain.minUs)}–{formatDomainSec(timeDomain.maxUs)} s
              </span>
              {durationUs > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  ({(durationUs / 1_000_000).toFixed(2)} s)
                </span>
              )}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-md px-2 text-xs"
            disabled={!selectedRow}
            onClick={() =>
              selectedRow &&
              void copyText(selectedRow.arbitrationId.toString(16).toUpperCase(), 'Arb ID')
            }
          >
            <Copy className="size-3.5" />
            ID
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-md px-2 text-xs"
            disabled={!selectedRow}
            onClick={() => selectedRow && void copyText(selectedRow.data, 'Data bytes')}
          >
            <Copy className="size-3.5" />
            Data
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-md px-2 text-xs"
            disabled={!selectedRow}
            onClick={() =>
              selectedRow &&
              void copyText(
                [
                  selectedRow.timeUs,
                  selectedRow.channel,
                  selectedRow.arbitrationId.toString(16).toUpperCase(),
                  selectedRow.type,
                  selectedRow.dlc,
                  selectedRow.data,
                ].join('\t'),
                'Row'
              )
            }
          >
            <Copy className="size-3.5" />
            Row
          </Button>
        </div>
      </div>

      <div className="border-border grid shrink-0 gap-2 border-b px-2 py-2 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="text-primary font-mono text-[10px] font-medium tracking-wide uppercase">
            Filter
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FrameFilterButton
              filter={filter}
              onApply={setFilter}
              timeDomain={timeDomain}
              disabled={snap.rawFrames.length === 0}
            />
            <select
              className="border-input bg-background h-7 rounded-md border px-2 font-mono text-xs"
              value={filter.channel}
              onChange={(e) => setFilter((prev) => ({ ...prev, channel: e.target.value }))}
            >
              <option value="all">All channels</option>
              {snap.channels.map((ch) => (
                <option key={ch} value={String(ch)}>
                  CAN {ch}
                </option>
              ))}
            </select>
            <select
              className="border-input bg-background h-7 rounded-md border px-2 font-mono text-xs"
              value={filter.type}
              onChange={(e) =>
                setFilter((prev) => ({
                  ...prev,
                  type: e.target.value as FrameFilterState['type'],
                }))
              }
            >
              <option value="all">All types</option>
              <option value="CAN">CAN</option>
              <option value="CAN FD">CAN FD</option>
              <option value="ERR">ERR</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-amber-700 dark:text-amber-400 font-mono text-[10px] font-medium tracking-wide uppercase">
            Search
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search.idQuery}
              onChange={(e) => setSearch((prev) => ({ ...prev, idQuery: e.target.value }))}
              placeholder="Search ID"
              className="border-sky-500/25 focus-visible:border-sky-500/50 h-7 w-[140px] font-mono text-xs"
            />
            <Input
              value={search.dataQuery}
              onChange={(e) => setSearch((prev) => ({ ...prev, dataQuery: e.target.value }))}
              placeholder="Search data bytes"
              className="border-violet-500/25 focus-visible:border-violet-500/50 h-7 w-[180px] font-mono text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={matches.length === 0}
              onClick={() => jumpMatch(-1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={matches.length === 0}
              onClick={() => jumpMatch(1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <div
              className={cn(
                'font-mono text-xs tabular-nums',
                matches.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground'
              )}
            >
              {matches.length === 0
                ? '0 matches'
                : `${matchCursor + 1} / ${matches.length}`}
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <FrameTable
          rows={filteredRows}
          selectedRowId={selectedRow?.rowId ?? null}
          onSelect={onSelect}
          timeDesc={timeDesc}
          onToggleTimeSort={() => setTimeDesc((v) => !v)}
          scrollToRowId={scrollToRowId}
        />
        <FrameDetailPanel row={selectedRow} decoded={decoded} />
      </div>
    </div>
  );
}
