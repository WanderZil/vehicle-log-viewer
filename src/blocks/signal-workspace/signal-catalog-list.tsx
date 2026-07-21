import { useCallback, useEffect, useRef, useState } from 'react';

import type { SignalItem } from '@/modules/analyses/types';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';

function signalLabel(signal: SignalItem) {
  return signal.messageName
    ? `${signal.messageName}::${signal.signalName}`
    : signal.signalName;
}

const DEFAULT_SIGNAL_W = 160;
const DEFAULT_MESSAGE_W = 112;
const DEFAULT_UNIT_W = 72;
const MIN_SIGNAL_W = 96;
const MIN_MESSAGE_W = 80;
const MIN_UNIT_W = 48;
const MIN_DESC_W = 120;

type Divider = 'signal-message' | 'message-unit' | 'unit-desc';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function SignalCatalogList({
  catalog,
  addedIds,
  onAdd,
  loading,
  emptyText,
}: {
  catalog: SignalItem[];
  addedIds: Set<string>;
  onAdd: (sig: SignalItem) => void;
  loading?: boolean;
  emptyText?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [signalW, setSignalW] = useState(DEFAULT_SIGNAL_W);
  const [messageW, setMessageW] = useState(DEFAULT_MESSAGE_W);
  const [unitW, setUnitW] = useState(DEFAULT_UNIT_W);
  const dragRef = useRef<{
    divider: Divider;
    startX: number;
    startSignalW: number;
    startMessageW: number;
    startUnitW: number;
    containerW: number;
  } | null>(null);

  const gridTemplateColumns = `${signalW}px ${messageW}px ${unitW}px minmax(0, 1fr)`;

  const startResize = useCallback(
    (divider: Divider, clientX: number) => {
      const containerW = containerRef.current?.clientWidth ?? 0;
      dragRef.current = {
        divider,
        startX: clientX,
        startSignalW: signalW,
        startMessageW: messageW,
        startUnitW: unitW,
        containerW,
      };
    },
    [signalW, messageW, unitW]
  );

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const delta = event.clientX - drag.startX;
      const fixedOther =
        drag.divider === 'signal-message'
          ? drag.startMessageW + drag.startUnitW
          : drag.divider === 'message-unit'
            ? drag.startSignalW + drag.startUnitW
            : drag.startSignalW + drag.startMessageW;

      const maxFor = (selfStart: number) =>
        drag.containerW - (fixedOther - selfStart) - MIN_DESC_W - 32;

      if (drag.divider === 'signal-message') {
        setSignalW(
          clamp(drag.startSignalW + delta, MIN_SIGNAL_W, maxFor(drag.startSignalW))
        );
        return;
      }

      if (drag.divider === 'message-unit') {
        setMessageW(
          clamp(drag.startMessageW + delta, MIN_MESSAGE_W, maxFor(drag.startMessageW))
        );
        return;
      }

      setUnitW(clamp(drag.startUnitW + delta, MIN_UNIT_W, maxFor(drag.startUnitW)));
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (loading) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">
        {m['analyses.refreshing']()}
      </p>
    );
  }

  if (catalog.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">
        {emptyText ?? m['analyses.signals_empty']()}
      </p>
    );
  }

  return (
    <div ref={containerRef} className="min-h-0">
      <div
        className="bg-muted/40 text-muted-foreground sticky top-0 z-10 grid border-b px-4 py-1.5 text-[10px] font-semibold tracking-wide uppercase select-none"
        style={{ gridTemplateColumns }}
      >
        <span className="truncate pr-2">{m['analyses.col_signal']()}</span>
        <span className="relative truncate px-2">
          {m['analyses.col_message']()}
          <ColumnResizeHandle
            ariaLabel={m['analyses.col_resize_signal_message']()}
            onPointerDown={(x) => startResize('signal-message', x)}
          />
        </span>
        <span className="relative truncate px-2">
          {m['analyses.col_unit']()}
          <ColumnResizeHandle
            ariaLabel={m['analyses.col_resize_message_unit']()}
            onPointerDown={(x) => startResize('message-unit', x)}
          />
        </span>
        <span className="relative truncate pl-2">
          {m['analyses.col_description']()}
          <ColumnResizeHandle
            ariaLabel={m['analyses.col_resize_unit_desc']()}
            onPointerDown={(x) => startResize('unit-desc', x)}
          />
        </span>
      </div>

      {catalog.map((signal) => {
        const isAdded = addedIds.has(signal.id);
        const label = signalLabel(signal);

        return (
          <div
            key={signal.id}
            role="button"
            tabIndex={isAdded ? -1 : 0}
            aria-disabled={isAdded}
            onClick={() => {
              if (!isAdded) onAdd(signal);
            }}
            onKeyDown={(event) => {
              if (isAdded) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onAdd(signal);
              }
            }}
            title={label}
            className={cn(
              'grid w-full border-b px-4 py-2 text-left text-xs transition-colors select-none',
              isAdded
                ? 'text-muted-foreground bg-muted/20 cursor-default opacity-60'
                : 'hover:bg-muted/50 cursor-pointer active:bg-muted/60'
            )}
            style={{ gridTemplateColumns }}
          >
            <p className="min-w-0 truncate pr-2 font-medium">{signal.signalName}</p>
            <span className="text-muted-foreground min-w-0 truncate self-center px-2 font-mono text-[10px]">
              {signal.messageName || '—'}
            </span>
            <span className="text-muted-foreground truncate self-center px-2 tabular-nums">
              {signal.unit || '—'}
            </span>
            <p className="text-muted-foreground line-clamp-2 min-w-0 self-center pl-2 text-[11px] leading-snug">
              {signal.description || '—'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ColumnResizeHandle({
  ariaLabel,
  onPointerDown,
}: {
  ariaLabel: string;
  onPointerDown: (clientX: number) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      className="absolute top-1/2 left-0 z-20 hidden h-4 w-1 -translate-x-1/2 -translate-y-1/2 cursor-col-resize touch-none rounded-full bg-border hover:bg-primary/60 active:bg-primary md:block"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown(event.clientX);
      }}
    />
  );
}
