import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, ListFilter } from 'lucide-react';

import {
  type FrameFilterState,
  type FrameTimeDomain,
} from '@/blocks/frame-viewer/frame-filter';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type FrameFilterKind = 'id' | 'data' | 'time';

const FILTER_KINDS: Array<{ id: FrameFilterKind; label: string }> = [
  { id: 'id', label: 'ID' },
  { id: 'data', label: 'Data' },
  { id: 'time', label: 'Time' },
];

function formatDomainSec(us: number) {
  return (us / 1_000_000).toFixed(3);
}

function summarizeAppliedFilters(filter: FrameFilterState): string[] {
  const tags: string[] = [];
  if (filter.idQuery.trim()) tags.push('ID');
  if (filter.dataQuery.trim()) tags.push('Data');
  if (filter.timeFromSec.trim() || filter.timeToSec.trim()) tags.push('Time');
  return tags;
}

function mergeDraftByKind(
  base: FrameFilterState,
  draft: FrameFilterState,
  kind: FrameFilterKind
): FrameFilterState {
  if (kind === 'id') return { ...base, idQuery: draft.idQuery };
  if (kind === 'data') return { ...base, dataQuery: draft.dataQuery };
  return {
    ...base,
    timeFromSec: draft.timeFromSec,
    timeToSec: draft.timeToSec,
  };
}

function clearKind(base: FrameFilterState, kind: FrameFilterKind): FrameFilterState {
  if (kind === 'id') return { ...base, idQuery: '' };
  if (kind === 'data') return { ...base, dataQuery: '' };
  return { ...base, timeFromSec: '', timeToSec: '' };
}

function sameFilterPayload(a: FrameFilterState, b: FrameFilterState) {
  return (
    a.idQuery === b.idQuery &&
    a.dataQuery === b.dataQuery &&
    a.timeFromSec === b.timeFromSec &&
    a.timeToSec === b.timeToSec &&
    a.channel === b.channel &&
    a.type === b.type
  );
}

export function FrameFilterButton({
  filter,
  onApply,
  timeDomain,
  disabled,
}: {
  filter: FrameFilterState;
  onApply: (next: FrameFilterState) => void;
  timeDomain: FrameTimeDomain | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FrameFilterKind>('id');
  const [draft, setDraft] = useState<FrameFilterState>(filter);
  const [applying, setApplying] = useState(false);
  const pendingRef = useRef<FrameFilterState | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const activeTags = useMemo(() => summarizeAppliedFilters(filter), [filter]);

  useEffect(() => {
    if (!open || applying) return;
    setDraft(filter);
  }, [open, filter, applying]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Close after parent committed the applied filter (heavy pass finished).
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || !applying) return;
    if (!sameFilterPayload(filter, pending)) return;

    pendingRef.current = null;
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    // One more frame so the filtered table can paint before the dialog closes.
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setApplying(false);
      closeTimerRef.current = null;
    }, 0);
  }, [filter, applying]);

  const commit = (next: FrameFilterState) => {
    setApplying(true);
    pendingRef.current = next;
    // Paint "Applying…" before the expensive filter pass.
    window.setTimeout(() => {
      onApply(next);
      // Fallback if React bails out because payload is unchanged.
      window.setTimeout(() => {
        if (pendingRef.current !== next) return;
        pendingRef.current = null;
        setOpen(false);
        setApplying(false);
      }, 50);
    }, 0);
  };

  const handleApply = () => {
    commit(mergeDraftByKind(filter, draft, kind));
  };

  const handleClearKind = () => {
    const next = clearKind(filter, kind);
    setDraft(next);
    commit(next);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={activeTags.length > 0 ? 'default' : 'outline'}
        className="h-7 gap-1.5 px-2 text-xs"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ListFilter className="size-3.5" />
        Filter
        {activeTags.length > 0 && (
          <span className="bg-background/20 rounded px-1 font-mono text-[10px]">
            {activeTags.join(' · ')}
          </span>
        )}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (applying) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-md gap-4" showCloseButton={!applying}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Filter className="size-4" />
              Frame filter
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 rounded-md border p-1">
            {FILTER_KINDS.map((item) => {
              const active = kind === item.id;
              const applied =
                item.id === 'id'
                  ? !!filter.idQuery.trim()
                  : item.id === 'data'
                    ? !!filter.dataQuery.trim()
                    : !!(filter.timeFromSec.trim() || filter.timeToSec.trim());
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={applying}
                  onClick={() => setKind(item.id)}
                  className={cn(
                    'relative flex-1 rounded px-2 py-1.5 font-mono text-xs transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.label}
                  {applied && (
                    <span
                      className={cn(
                        'absolute top-1 right-1 size-1.5 rounded-full',
                        active ? 'bg-primary-foreground' : 'bg-amber-500'
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-[88px] space-y-2">
            {kind === 'id' && (
              <>
                <p className="text-muted-foreground text-xs">
                  Match arbitration ID hex (comma-separated substrings).
                </p>
                <Input
                  value={draft.idQuery}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, idQuery: e.target.value }))
                  }
                  placeholder="e.g. 100,1A3"
                  disabled={applying}
                  className="h-8 font-mono text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !applying) handleApply();
                  }}
                />
              </>
            )}

            {kind === 'data' && (
              <>
                <p className="text-muted-foreground text-xs">
                  Match consecutive data bytes (hex).
                </p>
                <Input
                  value={draft.dataQuery}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, dataQuery: e.target.value }))
                  }
                  placeholder="e.g. 22 F1 90"
                  disabled={applying}
                  className="h-8 font-mono text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !applying) handleApply();
                  }}
                />
              </>
            )}

            {kind === 'time' && (
              <>
                <p className="text-muted-foreground text-xs">
                  Relative seconds from log start
                  {timeDomain
                    ? ` · data ${formatDomainSec(timeDomain.minUs)}–${formatDomainSec(timeDomain.maxUs)} s`
                    : ' · load a log first'}
                  .
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={draft.timeFromSec}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, timeFromSec: e.target.value }))
                    }
                    placeholder={
                      timeDomain ? formatDomainSec(timeDomain.minUs) : 'from'
                    }
                    disabled={applying || !timeDomain}
                    className="h-8 font-mono text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !applying && timeDomain) handleApply();
                    }}
                  />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={draft.timeToSec}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, timeToSec: e.target.value }))
                    }
                    placeholder={
                      timeDomain ? formatDomainSec(timeDomain.maxUs) : 'to'
                    }
                    disabled={applying || !timeDomain}
                    className="h-8 font-mono text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !applying && timeDomain) handleApply();
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={applying}
              onClick={handleClearKind}
            >
              Clear {FILTER_KINDS.find((k) => k.id === kind)?.label}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={applying}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={applying || (kind === 'time' && !timeDomain)}
                onClick={handleApply}
              >
                {applying ? 'Applying…' : 'Apply'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
