import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, Database, Eye, LineChart, ListTree } from 'lucide-react';

import { AnalysisToolbar } from '@/blocks/signal-viewer/analysis-toolbar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';

export type AnalyzeTab = 'graph' | 'trace' | 'dbc';

export function AnalyzeWorkspaceToolbar({
  analysisId,
  activeTab,
  onTabChange,
  onParsed,
  graphActions,
  blfFileName,
  statusLabel,
}: {
  analysisId: string;
  activeTab: AnalyzeTab;
  onTabChange: (tab: AnalyzeTab) => void;
  onParsed?: () => void;
  graphActions?: ReactNode;
  blfFileName?: string | null;
  statusLabel?: string;
}) {
  return (
    <div className="border-border bg-background flex h-10 shrink-0 items-center gap-2 border-b px-2">
      <Link to="/" className="flex shrink-0 items-center gap-1.5 px-1">
        <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-sm font-mono text-[9px] font-semibold">
          VL
        </span>
        <span className="hidden text-xs font-medium sm:inline">
          {envConfigs.app_name}
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        <AnalysisToolbar analysisId={analysisId} onParsed={onParsed} />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2" />
            }
          >
            <Eye className="size-3.5" />
            View
            <ChevronDown className="text-muted-foreground size-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup
              value={activeTab}
              onValueChange={(value) => {
                if (value === 'graph' || value === 'trace' || value === 'dbc') {
                  onTabChange(value);
                }
              }}
            >
              <DropdownMenuRadioItem value="graph" className="gap-2">
                <LineChart className="size-3.5" />
                Graph
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="trace" className="gap-2">
                <ListTree className="size-3.5" />
                Trace
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dbc" className="gap-2">
                <Database className="size-3.5" />
                {m['analyses.view_dbc']()}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {graphActions}
      </div>

      <div className="min-w-0 flex-1" />

      <div className="text-muted-foreground min-w-0 shrink-0 text-right text-[10px]">
        {blfFileName ? (
          <p className="max-w-[200px] truncate font-mono">{blfFileName}</p>
        ) : (
          <p className="truncate">{statusLabel ?? '—'}</p>
        )}
      </div>

      <ThemeToggle variant="outline" size="sm" />

      {envConfigs.commercial_url ? (
        <a
          href={envConfigs.commercial_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground hidden shrink-0 text-[10px] underline-offset-2 hover:underline sm:inline"
        >
          Pro
        </a>
      ) : null}
    </div>
  );
}
