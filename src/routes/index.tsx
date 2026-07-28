import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  AnalyzeWorkspaceToolbar,
  type AnalyzeTab,
} from '@/blocks/analyze-workspace-toolbar';
import { DbcViewer } from '@/blocks/dbc-viewer';
import { FrameViewer } from '@/blocks/frame-viewer';
import { SignalViewer } from '@/blocks/signal-viewer';
import { useClientAnalysisSession } from '@/hooks/use-client-analysis-session';
import { patchViewerLayoutSnapshot } from '@/lib/analysis-workspace-layout';
import {
  clearWorkspaceId,
  ensureWorkspaceAnalysisId,
} from '@/lib/analysis-workspace';
import { m } from '@/paraglide/messages.js';
import type { AnalysisItem } from '@/modules/analyses/types';

export type { AnalyzeTab };

function statusText(status?: AnalysisItem['status']) {
  if (!status) return '—';
  const key = `analyses.status_${status}` as const;
  return m[key]?.() ?? status;
}

function AnalyzePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clientSnap = useClientAnalysisSession();
  const search = useSearch({ strict: false }) as {
    fresh?: string;
    parsed?: string;
    count?: string;
    tab?: AnalyzeTab;
  };
  const freshHandledRef = useRef(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graphToolbarActions, setGraphToolbarActions] = useState<ReactNode>(null);
  const activeTab = search.tab ?? 'graph';

  useEffect(() => {
    patchViewerLayoutSnapshot({ tab: activeTab });
  }, [activeTab]);

  const handleParsed = useCallback(() => {
    if (!analysisId) return;
    queryClient.invalidateQueries({ queryKey: ['analysis-signals', analysisId] });
    queryClient.invalidateQueries({ queryKey: ['analysis-parse-meta', analysisId] });
  }, [analysisId, queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        if (search.fresh === '1' && !freshHandledRef.current) {
          freshHandledRef.current = true;
          clearWorkspaceId();
          void navigate({
            to: '/',
            search: {
              fresh: undefined,
              parsed: undefined,
              count: undefined,
              tab: activeTab,
            },
            replace: true,
          });
        }

        const id = await ensureWorkspaceAnalysisId();
        if (!cancelled) setAnalysisId(id);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to start workspace');
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [activeTab, navigate, search.fresh]);

  if (error) {
    return (
      <div className="text-destructive flex h-dvh items-center justify-center px-4 font-mono text-sm">
        {error}
      </div>
    );
  }

  if (!analysisId) {
    return (
      <div className="text-muted-foreground flex h-dvh items-center justify-center font-mono text-sm">
        {m['analyses.creating']()}
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex h-dvh w-full flex-col overflow-hidden">
      <AnalyzeWorkspaceToolbar
        analysisId={analysisId}
        activeTab={activeTab}
        onTabChange={(tab) =>
          void navigate({
            to: '/',
            search: {
              fresh: search.fresh,
              parsed: search.parsed,
              count: search.count,
              tab,
            },
            replace: true,
          })
        }
        onParsed={handleParsed}
        graphActions={graphToolbarActions}
        blfFileName={clientSnap.blfFileName}
        statusLabel={statusText(clientSnap.status)}
      />

      <div className="min-h-0 flex-1">
        <div className={activeTab === 'graph' ? 'h-full' : 'hidden'} aria-hidden={activeTab !== 'graph'}>
          <SignalViewer
            analysisId={analysisId}
            onRegisterToolbarActions={setGraphToolbarActions}
          />
        </div>
        <div className={activeTab === 'trace' ? 'h-full' : 'hidden'} aria-hidden={activeTab !== 'trace'}>
          <FrameViewer />
        </div>
        <div className={activeTab === 'dbc' ? 'h-full' : 'hidden'} aria-hidden={activeTab !== 'dbc'}>
          <DbcViewer />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    fresh: search.fresh === '1' || search.fresh === 1 ? '1' : undefined,
    parsed: search.parsed === '1' || search.parsed === 1 ? '1' : undefined,
    count: typeof search.count === 'string' ? search.count : undefined,
    tab:
      search.tab === 'trace' || search.tab === 'dbc' || search.tab === 'graph'
        ? search.tab
        : 'graph',
  }),
  component: AnalyzePage,
});
