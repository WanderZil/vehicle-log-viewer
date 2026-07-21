import { ChevronDown } from 'lucide-react';

import {
  formatDbcSelection,
  type ChannelMapping,
} from '@/modules/analyses/mapping';
import type { DbcItem } from '@/modules/analyses/types';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function ChannelDbcPicker({
  channel,
  dbcItems,
  value,
  onToggle,
  className,
}: {
  channel: number;
  dbcItems: DbcItem[];
  value: string[];
  onToggle: (dbcId: string, checked: boolean) => void;
  className?: string;
}) {
  const placeholder = m['analyses.mapping_unmapped']();
  const label = formatDbcSelection(value, dbcItems, placeholder);
  const hasSelection = value.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-8 w-full justify-between px-2 text-xs font-normal',
              !hasSelection && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">
            {m['analyses.mapping_channel']()} {channel}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {dbcItems.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs">
              {m['analyses.dbc_empty']()}
            </DropdownMenuItem>
          ) : (
            dbcItems.map((dbc) => {
              const checked = value.includes(dbc.id);
              return (
                <DropdownMenuItem
                  key={dbc.id}
                  className="gap-2 text-xs"
                  onClick={(event) => {
                    event.preventDefault();
                    onToggle(dbc.id, !checked);
                  }}
                >
                  <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                  <span className="min-w-0 truncate">{dbc.fileName}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
