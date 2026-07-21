import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, Info, Palette, RotateCcw, Trash2 } from 'lucide-react';

import type { SignalItem } from '@/modules/analyses/types';
import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import { SignalDetailDialog } from './signal-detail-dialog';
import { defaultSignalColor, SIGNAL_COLOR_OPTIONS } from './use-signal-workspace';

export function SignalContextMenu({
  signal,
  index,
  color,
  visible,
  hasCustomColor,
  children,
  onSetColor,
  onResetColor,
  onToggleVisible,
  onRemove,
}: {
  signal: SignalItem;
  index: number;
  color: string;
  visible: boolean;
  hasCustomColor: boolean;
  children: ReactNode;
  onSetColor: (color: string) => void;
  onResetColor: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="contents">{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette />
              {m['analyses.signal_menu_change_color']()}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44 p-2">
              <div className="grid grid-cols-4 gap-1.5">
                {SIGNAL_COLOR_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      'size-6 rounded-sm border transition-transform hover:scale-110',
                      color === option && 'ring-primary ring-2 ring-offset-1'
                    )}
                    style={{ backgroundColor: option, borderColor: option }}
                    aria-label={option}
                    onClick={() => onSetColor(option)}
                  />
                ))}
              </div>
              {hasCustomColor && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground mt-2 flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                  onClick={onResetColor}
                >
                  <RotateCcw className="size-3" />
                  {m['analyses.signal_menu_reset_color']()}
                </button>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuItem onClick={() => setDetailOpen(true)}>
            <Info />
            {m['analyses.signal_menu_details']()}
          </ContextMenuItem>

          <ContextMenuItem onClick={onToggleVisible}>
            {visible ? <EyeOff /> : <Eye />}
            {visible
              ? m['analyses.signal_menu_hide']()
              : m['analyses.signal_menu_show']()}
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem variant="destructive" onClick={onRemove}>
            <Trash2 />
            {m['analyses.signals_remove']()}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <SignalDetailDialog
        signal={signal}
        color={color}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}

export function signalColorForRow(
  signalId: string,
  index: number,
  seriesColor?: string
): string {
  return seriesColor ?? defaultSignalColor(index);
}
