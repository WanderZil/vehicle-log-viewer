import type { Table } from '@tanstack/react-table';
import { Columns3 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { SignalTableRow } from './signal-table-types';

export function SignalTableViewOptions({
  table,
  className,
}: {
  table: Table<SignalTableRow>;
  className?: string;
}) {
  const hideable = table
    .getAllColumns()
    .filter((column) => column.getCanHide() && column.id !== 'actions');

  if (hideable.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            className={cn('h-6 gap-1 px-2', className)}
          />
        }
      >
        <Columns3 className="size-3" />
        {m['analyses.col_columns']()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">
            {m['analyses.col_toggle']()}
          </DropdownMenuLabel>
          {hideable.map((column) => {
            const label =
              (column.columnDef.meta as { label?: string } | undefined)?.label ??
              column.id;
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="text-xs capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
