import { useMemo, useState } from 'react';
import { Keyboard } from 'lucide-react';

import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  formatShortcutDisplay,
  runtimeShortcutPlatform,
  SHORTCUT_CATEGORIES,
  shortcutById,
  type ShortcutPlatformHint,
} from './signal-shortcuts';

function msg(key: string): string {
  const fn = (m as Record<string, unknown>)[key];
  return typeof fn === 'function' ? (fn as () => string)() : key;
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="bg-muted text-muted-foreground border-border/80 inline-flex min-h-6 min-w-6 items-center justify-center rounded border px-1.5 font-mono text-[10px] font-medium"
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}

export function SignalShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const defaultHint = runtimeShortcutPlatform();
  const [hintPlatform, setHintPlatform] = useState<ShortcutPlatformHint>(defaultHint);

  const categories = useMemo(
    () =>
      SHORTCUT_CATEGORIES.map((category) => ({
        ...category,
        items: category.shortcutIds
          .map((id) => shortcutById(id))
          .filter((item): item is NonNullable<typeof item> => item !== undefined),
      })),
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4" />
            {m['analyses.shortcuts.title']()}
          </DialogTitle>
          <DialogDescription>{m['analyses.shortcuts.description']()}</DialogDescription>
          <div className="flex items-center gap-1 pt-2">
            <span className="text-muted-foreground text-xs">
              {m['analyses.shortcuts.platform']()}:
            </span>
            <div className="bg-muted/50 flex rounded-md border p-0.5">
              <Button
                type="button"
                size="xs"
                variant={hintPlatform === 'windows' ? 'default' : 'ghost'}
                className="h-6 px-2"
                onClick={() => setHintPlatform('windows')}
              >
                {m['analyses.shortcuts.platform_windows']()}
              </Button>
              <Button
                type="button"
                size="xs"
                variant={hintPlatform === 'macos' ? 'default' : 'ghost'}
                className="h-6 px-2"
                onClick={() => setHintPlatform('macos')}
              >
                {m['analyses.shortcuts.platform_macos']()}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            {categories.map((category) => (
              <section key={category.id}>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  {msg(category.labelKey)}
                </h3>
                <div className="divide-border/60 divide-y rounded-lg border">
                  {category.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1">{msg(item.labelKey)}</span>
                      <ShortcutKeys keys={formatShortcutDisplay(item, hintPlatform)} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="border-t px-5 py-3">
          <p className="text-muted-foreground text-xs">
            {hintPlatform === 'macos'
              ? m['analyses.shortcuts.mac_note']()
              : m['analyses.shortcuts.windows_note']()}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SignalShortcutsButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn('h-7 gap-1.5 px-2', className)}
      onClick={onClick}
      title={m['analyses.shortcuts.title']()}
    >
      <Keyboard className="size-3.5" />
      <span className="hidden sm:inline">{m['analyses.shortcuts.button']()}</span>
    </Button>
  );
}
