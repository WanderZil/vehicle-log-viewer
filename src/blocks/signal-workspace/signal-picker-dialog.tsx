import { Search } from 'lucide-react';

import type { SignalItem } from '@/modules/analyses/types';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { SignalCatalogList } from './signal-catalog-list';

export function SignalPickerDialog({
  open,
  onOpenChange,
  catalog,
  catalogTotal,
  addedIds,
  search,
  onSearchChange,
  loading,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: SignalItem[];
  catalogTotal: number;
  addedIds: Set<string>;
  search: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  onAdd: (sig: SignalItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80dvh,640px)] max-h-[min(80dvh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-border/60 border-b px-4 py-3">
          <DialogTitle className="text-base">{m['analyses.signals_picker_title']()}</DialogTitle>
          <p className="text-muted-foreground text-xs">
            {m['analyses.signals_picker_hint']({ total: catalogTotal })}
          </p>
        </DialogHeader>

        <div className="border-border/60 border-b px-4 py-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={m['analyses.signals_search_placeholder']()}
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y">
          <SignalCatalogList
            catalog={catalog}
            addedIds={addedIds}
            onAdd={onAdd}
            loading={loading}
          />
        </div>

        <div className="border-border/60 flex justify-end border-t px-4 py-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            {m['analyses.signals_picker_close']()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
