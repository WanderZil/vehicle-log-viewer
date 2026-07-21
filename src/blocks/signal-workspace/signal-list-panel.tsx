import { Crosshair, Ruler, Search, X } from 'lucide-react';

import type { SignalItem } from '@/modules/analyses/types';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Input } from '@/components/ui/input';

import { SignalCatalogList } from './signal-catalog-list';

import {
  formatHex,
  formatTimeUs,
  formatValue,
  PALETTE,
  type Series,
  valueAt,
} from './use-signal-workspace';

export function SignalListPanel({
  search,
  onSearchChange,
  catalog,
  addedIds,
  added,
  series,
  hasDomain,
  tMin,
  mainTime,
  diffTime,
  diffOn,
  onAdd,
  onRemove,
  compact = false,
  loading = false,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  catalog: SignalItem[];
  addedIds: Set<string>;
  added: SignalItem[];
  series: Series[];
  hasDomain: boolean;
  tMin: number;
  mainTime: number;
  diffTime: number;
  diffOn: boolean;
  onAdd: (sig: SignalItem) => void;
  onRemove: (id: string) => void;
  compact?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {hasDomain && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="text-foreground/80 flex items-center gap-1">
            <Crosshair className="size-3" />
            {m['analyses.signals_main_cursor']()}: {formatTimeUs(mainTime - tMin)}
          </span>
          {diffOn && (
            <>
              <span className="flex items-center gap-1">
                <Ruler className="size-3" />
                {m['analyses.signals_diff_cursor']()}: {formatTimeUs(diffTime - tMin)}
              </span>
              <span className="text-foreground/80">
                {m['analyses.signals_dt']()} {formatTimeUs(mainTime - diffTime)}
              </span>
            </>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={m['analyses.signals_search_placeholder']()}
          className="h-8 pl-8 text-sm"
        />
      </div>

      <div className={cn('overflow-auto pr-1', compact ? 'max-h-52' : 'max-h-64')}>
        <SignalCatalogList
          catalog={catalog}
          addedIds={addedIds}
          onAdd={onAdd}
          loading={loading}
        />
      </div>

      <div className="border-t pt-3">
        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
          {m['analyses.signals_added_title']()}
        </p>
        <div
          className={cn(
            'space-y-1.5 overflow-auto pr-1',
            compact ? 'max-h-[min(40vh,280px)]' : 'max-h-[360px]'
          )}
        >
          {added.map((sig, index) => {
            const s = series[index];
            const mainV = s ? valueAt(s.points, mainTime) : null;
            const diffV = diffOn && s ? valueAt(s.points, diffTime) : null;
            const delta = mainV !== null && diffV !== null ? mainV - diffV : null;
            return (
              <div
                key={sig.id}
                className="flex items-start gap-2 rounded-md border px-2 py-1.5"
              >
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sig.signalName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {sig.messageName || '-'} · ch{sig.channel ?? 0}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {mainV !== null ? formatValue(mainV) : '--'}
                    {sig.unit ? (
                      <span className="text-muted-foreground ml-1 text-xs font-normal">
                        {sig.unit}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground font-mono text-[11px]">
                    {mainV !== null ? formatHex(mainV) : '--'}
                  </p>
                  {diffOn && (
                    <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500">
                      {m['analyses.signals_delta']()}{' '}
                      {delta !== null ? formatValue(delta) : '--'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(sig.id)}
                  aria-label={m['analyses.signals_remove']()}
                  className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
          {added.length === 0 && (
            <p className="text-muted-foreground text-sm">{m['analyses.signals_no_added']()}</p>
          )}
        </div>
      </div>
    </div>
  );
}
